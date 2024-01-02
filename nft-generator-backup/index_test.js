#!/usr/bin/env node

//TODO
//CHECK FOR TRAILING SLASHES ON ALL INPUTS

//IMPORTS
const chalk = require('chalk');
const boxen = require('boxen');
const ora = require('ora');
const inquirer = require('inquirer');
const fs = require('fs');
const { readFile, writeFile, readdir } = require("fs").promises;
const mergeImages = require('merge-images');
const { Image, Canvas } = require('canvas');
const ImageDataURI = require('image-data-uri');
const xlsx = require("json-as-xlsx");
const path = require('node:path');
const sha1 = require('sha1');

//SETTINGS
let basePath;
let outputPath;
let traits;
let traitsToSort = [];
let order = [];
let weights = {};
let names = {};
let weightedTraits = [];
let seen = [];
let generatedImg = [];
let metaData = {};
let totalFilesNumber = 0;
let config = {
  metaData: {},
  useCustomNames: null,
  deleteDuplicates: null,
  generateMetadata: null,
  generateFileSummary: null,
};
let loadedConfig = false;
let saveConfig = true;
let nftRarityScore = {};
let elementSummary = {};
let startingNFTId = 1;
let overidingMetadataFile = true;
let traitName = [];
let traitValueCount = {};

//DEFINITIONS
const getDirectories = source =>
  fs
    .readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

const sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000));

//OPENING
console.log(
  boxen(
    chalk.red(
        '     _/_/_/  _/_/_/    _/_/_/_/    _/_/    _/_/_/_/_/    _/_/    _/_/_/    _/      _/      _/      _/  _/_/_/_/  _/_/_/_/_/        _/_/_/  _/_/_/_/  _/      _/  _/_/_/_/  _/_/_/      _/_/    _/_/_/_/_/    _/_/    _/_/_/    \n' +
        '  _/        _/    _/  _/        _/    _/      _/      _/    _/  _/    _/    _/  _/        _/_/    _/  _/            _/          _/        _/        _/_/    _/  _/        _/    _/  _/    _/      _/      _/    _/  _/    _/   \n' +
        ' _/        _/_/_/    _/_/_/    _/_/_/_/      _/      _/    _/  _/_/_/        _/          _/  _/  _/  _/_/_/        _/          _/  _/_/  _/_/_/    _/  _/  _/  _/_/_/    _/_/_/    _/_/_/_/      _/      _/    _/  _/_/_/      \n' +
        '_/        _/    _/  _/        _/    _/      _/      _/    _/  _/    _/      _/          _/    _/_/  _/            _/          _/    _/  _/        _/    _/_/  _/        _/    _/  _/    _/      _/      _/    _/  _/    _/     \n' +
        ' _/_/_/  _/    _/  _/_/_/_/  _/    _/      _/        _/_/    _/    _/      _/          _/      _/  _/            _/            _/_/_/  _/_/_/_/  _/      _/  _/_/_/_/  _/    _/  _/    _/      _/        _/_/    _/    _/      \n' +
        '\n'
        
    ) +
      chalk.red('Made with ')+
      chalk.green('❤ ') +
      chalk.red(' by ToanTran - CREATORY PRODUCT TEAM'),
    { borderColor: 'red', padding: 3 }
  )
);

main();

async function main() {

  await loadConfig(path.join(process.cwd(),"config.json"));

  await getBasePath();
  await getOutputPath();
  await checkForDuplicates();
  await generateMetadataPrompt();
  await loadMetadataFile();
  await startingIdPrompt();
  if (config.generateMetadata) {
    await metadataSettings();
  }
  await generateFileSummaryPrompt();
  const loadingDirectories = ora('Loading traits');
  loadingDirectories.color = 'yellow';
  loadingDirectories.start();
  traits = getDirectories(basePath);
  traitsToSort = [...traits];
  await sleep(2);
  loadingDirectories.succeed();
  loadingDirectories.clear();
  await traitsOrder(true);
  await customNamesPrompt();
  await asyncForEach(traits, async trait => {
    await setNames(trait);
  });
  await asyncForEach(traits, async trait => {
    await setWeights(trait);
  });

  // Start checking start ID of NFT
  const checkingOption = ora('Checking Starting ID of NFT');
  checkingOption.color = 'yellow';
  checkingOption.start();
  checkingOption.succeed('You choose to start NFT with ID: ' + startingNFTId);
  if(config.metaData.splitFiles){
    checkingOption.succeed('You choose split metadata file to ' + (outputPath + '/metadata'));
  }
  if(config.generateFileSummary){
    checkingOption.succeed('You choose to generate Summary to ' + outputPath);
  }
  await sleep(3);
  checkingOption.clear();

  // Start generating images
  const generatingImages = ora('Generating images');
  generatingImages.color = 'yellow';
  generatingImages.start();
  await generateImages();
  await sleep(2);
  generatingImages.succeed('All images generated!');
  generatingImages.clear();

  // Start checking duplicate in metadata
  const checkingDuplicate = ora('Checking duplicate');
  checkingDuplicate.color='yellow';
  checkingDuplicate.start();
  duplicateMetadata = checkDuplicateMetadata(generatedImg);
  await sleep(2);
  if (duplicateMetadata) {
    checkingDuplicate.succeed('No duplicate');
  } else {
    checkingDuplicate.succeed('Have duplicate');
  }
  checkingDuplicate.clear();

  // Start exporting metadata
  if (config.generateMetadata) {
    const writingMetadata = ora('Exporting metadata');
    writingMetadata.color = 'yellow';
    writingMetadata.start();
    await writeMetadata();
    await sleep(2);
    writingMetadata.succeed('Exported metadata successfully');
    writingMetadata.clear();
  }

  // Start writing file summary
  if (config.generateFileSummary) {
    const writingFileSummary = ora('Writing Files Summary');
    writingFileSummary.color = 'yellow';
    writingFileSummary.start();
    await writeFileSummary();
    await sleep(2);
    writingFileSummary.succeed('Exported Files Summary successfully');
    writingFileSummary.clear();
  }

  // Start saving config
  if (saveConfig) {
    const writingConfig = ora('Saving configuration');
    writingConfig.color = 'yellow';
    writingConfig.start();
    await writeConfig();
    await sleep(2);
    writingConfig.succeed('Saved configuration successfully');
    writingConfig.clear();
  }
}

//GET THE BASEPATH FOR THE IMAGES
async function getBasePath() {
  if (config.basePath !== undefined && path.isAbsolute(config.basePath)) { 
    basePath = config.basePath;
    return;
  }
  const { base_path } = await inquirer.prompt([
    {
      type: 'list',
      name: 'base_path',
      message: 'Where are your images located?',
      choices: [
        { name: 'In the current directory', value: 0 },
        { name: 'Somewhere else on my computer', value: 1 },
      ],
    },
  ]);
  if (base_path === 0) {
    basePath = path.join(process.cwd() , 'images');
  } else {
    let wrongInput = true;
    while(wrongInput){
      const { file_location } = await inquirer.prompt([
        {
          type: 'input',
          name: 'file_location',
          message: 'Enter the path to your image files (Absolute filepath)',
        },
      ]);
      if(path.isAbsolute(file_location) && fs.lstat(file_location).isDirectory()){
        basePath = file_location;
        wrongInput = false;
      }
    }
  }
  config.basePath = basePath;
}

//GET THE OUTPUTPATH FOR THE IMAGES
async function getOutputPath() {
  if (config.outputPath !== undefined && path.isAbsolute(config.outputPath)) {
    outputPath = config.outputPath;
    return;
  }
  const { output_path } = await inquirer.prompt([
    {
      type: 'list',
      name: 'output_path',
      message: 'Where should the generated images be exported?',
      choices: [
        { name: 'In the current directory', value: 0 },
        { name: 'Somewhere else on my computer', value: 1 },
      ],
    },
  ]);
  if (output_path === 0) {
    outputPath = path.join(process.cwd(), 'output');
  } else {
    let wrongInput = true;
    while(wrongInput){
      const { file_location } = await inquirer.prompt([
        {
          type: 'input',
          name: 'file_location',
          message:
            'Enter the path to your output directory (Absolute filepath)',
        },
      ]);
      if(path.isAbsolute(file_location) && fs.lstat(file_location).isDirectory()){
        outputPath = file_location;
        wrongInput = false;
      }
    }
  }
  config.outputPath = outputPath;
}

async function checkForDuplicates() {
  if (config.deleteDuplicates !== null) return;
  let { checkDuplicates } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'checkDuplicates',
      message:
        'Should duplicated images be deleted? (Might result in less images then expected)',
    },
  ]);
  config.deleteDuplicates = checkDuplicates;
}

async function generateMetadataPrompt() {
  if (config.generateMetadata !== null) return;
  let { createMetadata } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'createMetadata',
      message: 'Should metadata be generated?',
    },
  ]);
  config.generateMetadata = createMetadata;
}

async function generateFileSummaryPrompt() {
  if(config.generateFileSummary !== null) return;
  let { createSummaryFile } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'createSummaryFile',
      message: 'Should Files Summary be generated?',
    }
  ]);
  config.generateFileSummary = createSummaryFile;
}

async function metadataSettings() {
  if (Object.keys(config.metaData).length !== 0) return;
  let responses = await inquirer.prompt([
    {
      type: 'input',
      name: 'metadataName',
      message: 'What should be the name? (Generated format is NAME#ID)',
    },
    {
      type: 'input',
      name: 'metadataDescription',
      message: 'What should be the description?',
    },
    {
      type: 'input',
      name: 'metadataImageUrl',
      message: 'What should be the image url? (Generated format is URL/ID)',
    },
    {
      type: 'confirm',
      name: 'splitFiles',
      message: 'Should JSON metadata be split in multiple files?',
    },
  ]);
  config.metaData.name = responses.metadataName;
  config.metaData.description = responses.metadataDescription;
  config.metaData.splitFiles = responses.splitFiles;
  let lastChar = responses.metadataImageUrl.slice(-1);
  if (lastChar === '/') config.imageUrl = responses.metadataImageUrl;
  else config.imageUrl = responses.metadataImageUrl + '/';
}

//SELECT THE ORDER IN WHICH THE TRAITS SHOULD BE COMPOSITED
async function traitsOrder(isFirst) {
  if (config.order && config.order.length === traits.length) {
    order = config.order;
    return;
  }
  const traitsPrompt = {
    type: 'list',
    name: 'selected',
    choices: [],
  };
  traitsPrompt.message = 'Which trait should be on top of that?';
  if (isFirst === true) traitsPrompt.message = 'Which trait is the background?';
  traitsToSort.forEach(trait => {
    const globalIndex = traits.indexOf(trait);
    traitsPrompt.choices.push({
      name: trait.toUpperCase(),
      value: globalIndex,
    });
  });
  const { selected } = await inquirer.prompt(traitsPrompt);
  order.push(selected);
  config.order = order;
  let localIndex = traitsToSort.indexOf(traits[selected]);
  traitsToSort.splice(localIndex, 1);
  if (order.length === traits.length) return;
  await traitsOrder(false);
}

//SELECT IF WE WANT TO SET CUSTOM NAMES FOR EVERY TRAITS OR USE FILENAMES
async function customNamesPrompt() {
    if (config.useCustomNames !== null) return;
    let { useCustomNames } = await inquirer.prompt([
      {
        type: 'list',
        name: 'useCustomNames',
        message: 'How should be constructed the names of the traits?',
        choices: [
          { name: 'Use filenames as traits names', value: 0 },
          { name: 'Choose custom names for each trait', value: 1 },
        ],
      },
    ]);
    config.useCustomNames = useCustomNames;
}

//SET NAMES FOR EVERY TRAIT
async function setNames(trait) {
  if (config.useCustomNames) {
    names = config.names || names;
    const files = await getFilesForTrait(trait);
    const namePrompt = [];
    files.forEach((file, i) => {
      if (config.names && config.names[file] !== undefined) return;
      namePrompt.push({
        type: 'input',
        name: trait + '_name_' + i,
        message: 'What should be the name of the trait shown in ' + file + '?',
      });
    });
    const selectedNames = await inquirer.prompt(namePrompt);
    files.forEach((file, i) => {
      if (config.names && config.names[file] !== undefined) return;
      names[file] = selectedNames[trait + '_name_' + i];
    });
    config.names = {...config.names, ...names};
  } else {
    const files = fs.readdirSync(path.join(basePath,trait));
    files.forEach((file, i) => {
      names[file] = file.split('.')[0];
    });
  }
}

//SET WEIGHTS FOR EVERY TRAIT
async function setWeights(trait) {
  if (config.weights && Object.keys(config.weights).length === Object.keys(names).length ) {
    weights = config.weights;
    return;
  }
  const files = await getFilesForTrait(trait);
  const weightPrompt = [];
  files.forEach((file, i) => {
    weightPrompt.push({
      type: 'input',
      name: names[file] + '_weight',
      message: 'How many ' + names[file] + ' ' + trait + ' should there be?',
      default: parseInt(Math.round(10000 / files.length)),
    });
  });
  const selectedWeights = await inquirer.prompt(weightPrompt);
  files.forEach((file, i) => {
    weights[file] = selectedWeights[names[file] + '_weight'];
  });
  config.weights = weights;
}

//ASYNC FOREACH
async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

//GENERATE WEIGHTED TRAITS
async function generateWeightedTraits() {
  for (const trait of traits) {
    let totalFileInTrait = 0;
    const traitWeights = [];
    const files = await getFilesForTrait(trait);
    
    files.forEach(file => {
      for (let i = 0; i < weights[file]; i++) { 
        traitWeights.push(file);
        totalFileInTrait++;
      }
    });
    weightedTraits.push(traitWeights);
    
    totalFilesNumber = totalFileInTrait;

  }
}


// SET STARTING ID
async function startingIdPrompt(){
  
  let { changeId } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'changeId',
      message: 'The starting ID of your new generated NFT is 1? If chosing NO, you need to input your desired starting number in next question',
    },
  ]);

  if(!changeId){
    let wrongInput = true;
    while(wrongInput){
      let {startingId} = await inquirer.prompt([
        {
          type: 'input',
          name: 'startingId',
          message: 'Input the number for starting ID',
        },
      ]);
      if(!isNaN(parseInt(startingId))){
        wrongInput = false;
      }
      startingNFTId = parseInt(startingId);
    }
    
    overidingMetadataFile = false;

  }

}
//GENARATE IMAGES
async function generateImages() {
  await generateWeightedTraits();
  
  
  for(key in weights) {
    let expectedWeight = {'expected':0 , 'generated':0}
    expectedWeight['expected'] = weights[key];
    elementSummary[key] = expectedWeight;
  }
  

  let images = [];
  let matches = 1;
  let id = startingNFTId;
  console.log(totalFilesNumber)
  if (config.deleteDuplicates) {
    while (!Object.values(weightedTraits).filter(arr => arr.length == 0).length && (id+totalFilesNumber)<=totalFilesNumber) {
      let picked = [];
      order.forEach(id => {
        // for(key in elementSummary){
        //   if(elementSummary[key]['generated'] === parseInt(weights[key])){
        //     weightedTraits[id]=weightedTraits[id].filter(function(value,index,arr){return value != key})
        //   }
        // }
        let pickedImgId = pickRandom(weightedTraits[id]);
        picked.push(pickedImgId);
        let pickedImg = weightedTraits[id][pickedImgId];
        images.push(path.join(basePath,traits[id],pickedImg));
      });
      console.log(images);
      if (existCombination(seen, images)) {
        matches++;
        images = [];
        console.log('Find matches #', matches)
      } else {
        generateMetadataObject(id, images);
        seen.push(images);
        let generatedImgMetadata = metaData[id].attributes;
        metaData[id]['DNA#1'] = ""
        for(var i = 0; i < generatedImgMetadata.length; i++){
          metaData[id]['DNA#1'] += generatedImgMetadata[i].value
        }
        metaData[id]['DNA'] = sha1(metaData[id]['DNA#1'])
        
        generatedImg.push(generatedImgMetadata)
        for (var key in weights) {
          for (var index = 0; index < generatedImgMetadata.length; index++){
            
            if(key === (generatedImgMetadata[index].value + '.png')){
              elementSummary[key]['generated']++;
            }
          }
        }
        const b64 = await mergeImages(images, { Canvas: Canvas, Image: Image });
        await ImageDataURI.outputFile(b64, path.join(outputPath,`${id}.png`));
        console.log("Generated and saved the Image #",id, '\n');
        images = [];
        id++;
        
      }

    }
  } else {
    while (!Object.values(weightedTraits).filter(arr => arr.length == 0).length) {
      order.forEach(id => {
        images.push(
          basePath + traits[id] + '/' + pickRandomAndRemove(weightedTraits[id])
        );
      });
      generateMetadataObject(id, images);
      const b64 = await mergeImages(images, { Canvas: Canvas, Image: Image });
      await ImageDataURI.outputFile(b64, outputPath + `${id}.png`);
      images = [];
      id++;
    }
  }
}

//GENERATES RANDOM NUMBER BETWEEN A MAX AND A MIN VALUE
function randomNumber(min, max) {
  return Math.round( ( Math.random() * (max - min) ) + min);
}

//PICKS A RANDOM INDEX INSIDE AN ARRAY RETURNS IT AND THEN REMOVES IT
function pickRandomAndRemove(array) {
  const toPick = randomNumber(0, array.length - 1);
  const pick = array[toPick];
  array.splice(toPick, 1);
  return pick;
}

//PICKS A RANDOM INDEX INSIDE AND ARRAY RETURNS IT
function pickRandom(array) {
  return randomNumber(0, array.length - 1);
}

function remove(array, toPick) {
  array.splice(toPick, 1);
}

function existCombination(arr, contains) {
  let exists = false;
  arr.forEach(array => {
    let isEqual =
      array.length === contains.length &&
      array.every(isSame);

      function isSame(value, index, array) {
        return value === contains[index];
      }
    if (isEqual) exists = true;
  });
  return exists;
}

function generateMetadataObject(id, images) {
  metaData[id] = {
    name: config.metaData.name + '#' + id,
    description: config.metaData.description,
    image: config.imageUrl + id,
    attributes: [],
  };
  images.forEach((image, i) => {

    metaData[id].attributes.push({
      trait_type: traits[order[i]],
      value: path.basename(image, '.png'),
    });
    traitName.push(traits[order[i]])
  });
}

async function updateEntry(entries, entry) {
  for (let i = 0; i < entries.length; i++) {
    if (entry[0] != entries[i][0]) continue;
    for (let j = 1; j < entry.length; j++) {
      if (entry[j] >= entries[i][j])
        entries[i][j] = entry[j];
    }
    return;
  }
  entries.push(entry);
}

// CALCULATE RARITY SCORE
async function rarityCalculate(){
  for(key in metaData){
    let total_rarity_score = 0;
    let totalNFT = Object.keys(metaData).length;
    for(var i = 0; i < metaData[key]['attributes'].length; i++){
      let traitValue = metaData[key]['attributes'][i]['value'];
      metaData[key]['attributes'][i]['rarity_score'] = (1/ (traitValueCount[traitValue] / totalNFT)).toFixed(2);
      total_rarity_score += parseFloat(metaData[key]['attributes'][i]['rarity_score']);
    }
    metaData[key]['total_rarity_score'] = total_rarity_score;
    nftRarityScore[key] = total_rarity_score;
  }
}

// COUNT TRAIT VALUE
async function countTraitValue(){
  const traitSet = new Set();
  for(key in metaData){
    for(var i =0; i<metaData[key]['attributes'].length; i++){
      traitSet.add(metaData[key]['attributes'][i]['value']);
    }
  }
  for(var i = 0; i<traitSet.length; i++){
    let count = 0;
    for(key in metaData){
      for(var j =0; j<metaData[key]['attributes'].length; j++){
        if(traitSet[i] === metaData[key]['attributes'][j]['value']){
          count++;
        }
      }
      traitValueCount[traitSet[i]] = count;
    }
  }
}

// SORT NFT BY TOTAL RARITY SCORE
async function sortrarityScore(){
  let sortableNFTRarityScore = [];
  for(nft in nftRarityScore) {
    sortableNFTRarityScore.push([nft, parseFloat(nftRarityScore[nft])]);
  };
  sortableNFTRarityScore.sort(function(a, b) {
    return a[1] - b[1];
});
  return sortableNFTRarityScore
}

async function checkDuplicateMetadata(arrToCheck) {
  let output = [];
  for (let i = 0; i<arrToCheck.length; i++){
    updateEntry(output, arrToCheck[i])
  }

  return arrToCheck.length === output.length

}

// GENERATE EXCEL FILE
async function generateExcelMetadataFile(){

  let excelData = [{
    sheet : "Generated NFT data",
    columns : [
      { label :  "NFT name", value : "nft_name"}
    ],
    content : []
  }];
  
  let excelRowContent = {};
  
  let excelColumnName = {};

  const exportSetting = {
    fileName : "Metadata"
  };

  for(var i=0; i<traitName.length; i++){
    excelColumnName = {};
    excelColumnName['label'] = traitName[i];
    excelColumnName['value'] = traitName[i];
    excelData[0]['columns'].push(excelColumnName)
  }
  excelData[0]['columns'].push({
    label : "DNA_Original",
    value : "DNA_Original",
  })
  excelData[0]['columns'].push({
    label : "DNA",
    value : "DNA",
  })

  excelData[0]['columns'].push({
    label : "total_rarity_score",
    value : "total_rarity_score"
  })

  for(key in metaData){
    excelRowContent = {}
    excelRowContent["nft_name"] =  key+".png"
    for(var i = 0; i<metaData[key]['attributes'].length; i++ ){
      excelRowContent[metaData[key]['attributes'][i].trait_type] = metaData[key]['attributes'][i].value
    };
    excelRowContent['DNA_Original'] = metaData[key]['DNA#1'];
    excelRowContent['DNA'] = metaData[key]['DNA'];
    excelRowContent['total_rarity_score'] = metaData[key]['total_rarity_score'];
    excelData[0]['content'].push(excelRowContent);
  }
  
  xlsx(excelData, exportSetting);
}

// GENERATE METADATA FILE FOR COLLECTION 
async function writeMetadata() {

  let metadata_output_dir = path.join(outputPath, "metadata")

  if (!fs.existsSync(metadata_output_dir)) {
    fs.mkdirSync(metadata_output_dir, { recursive: true });
  }

  await rarityCalculate();

  await generateExcelMetadataFile();

  fs.rename("Metadata.xlsx", path.join(metadata_output_dir,"Metadata.xlsx"), function (err) {
    if (err) {
        throw err
    } else {
        console.log("\nSuccessfully moved the file!");
    }
  });



  if(config.metaData.splitFiles)
  { 

    if(overidingMetadataFile){
      await writeFile(path.join(metadata_output_dir,'metadata.json'), JSON.stringify(metaData));
    } else{
      await writeFile(path.join(metadata_output_dir,'metadata.json'), JSON.stringify(metaData), { flag: 'a+' },  err => {console.log(err)});
    }
    
    
    
    for (var key in metaData){
      await writeFile(path.join(metadata_output_dir, key), JSON.stringify(metaData[key]));
    }


  }else
  {
    if(overidingMetadataFile){
      await writeFile(path.join(metadata_output_dir,'metadata.json'), JSON.stringify(metaData));
    } else{
      await writeFile(path.join(metadata_output_dir,'metadata.json'), JSON.stringify(metaData), { flag: 'a+' },  err => {console.log(err)});
    }
  }
}

async function padLeadingZeros(num, size) {
  var s = num+"";
  while (s.length < size) s = "0" + s;
  return s;
}

// GENERATE SUMMARY FILE
async function writeFileSummary(){
  if(config.generateFileSummary){
    let summary_file_output_dir = path.join(outputPath, "file_generated_summary")

    if (!fs.existsSync(summary_file_output_dir)) {
      fs.mkdirSync(summary_file_output_dir, { recursive: true });
    }

    await writeFile(path.join(summary_file_output_dir,'Summary.json'), JSON.stringify(elementSummary));
    await writeFile(path.join(summary_file_output_dir,'Files_Generated_Summary.txt'), "**** ELEMENT USED ****" + "\n", err => {});
    let content = ""
    for(key in elementSummary){
      content = key + '- ' + "Expected: " + elementSummary[key]['expected'] + " - Generated: " + elementSummary[key]['generated'] + "\n";
      await writeFile(path.join(summary_file_output_dir, 'Files_Generated_Summary.txt'), content, { flag: 'a+' }, err => {});
    };

    await writeFile(path.join(summary_file_output_dir ,'Top_Rarity_Score_In_Collection_Report.txt'),"\n" + "**** TOP RARITY SCORE NFT ****" + "\n", { flag: 'a+' }, err => {});
    let topRarityScore = await sortrarityScore();
    let top10RarityScore = topRarityScore.slice(0,10);
    for(var i=0; i < top10RarityScore.length; i++){
      content = "#" + await padLeadingZeros((i+1),2) + " : " + top10RarityScore[i][0] + ".png" + " with total_rarity_score is " + top10RarityScore[i][1] + "\n";
      await writeFile(path.join(summary_file_output_dir ,'Top_Rarity_Score_In_Collection_Report.txt'), content, { flag: 'a+' }, err => {});
    }
  }
}

// LOAD CONFIG
async function loadConfig(file) {
  try {
    const data = await readFile(file);
    config = JSON.parse(data.toString());
  } catch (error) {
    console.log("Could not load configuration file.");
    try{
      const { configFileLocation } = await inquirer.prompt([
        {
          type: 'input',
          name: 'configFileLocation',
          message:
            'Input the path to your config.json file (Absolute filepath). If you DO NOT have saved config file, press ENTER to skip.',
        },
      ]);
      configFile = path.join(configFileLocation,'config.json')
      const data = await readFile(configFile);
      config = JSON.parse(data.toString());
      saveConfig =false;
    } catch(error){
      console.log('Could not load configuration file');
      saveConfig = true;
    }
  }
        
}

//LOAD METADATA
async function loadMetadataFile(){
  const metadatFilepath = path.join(outputPath, "metadata", "metadata.json")
  try{

    if(fs.existsSync(metadatFilepath)){
      const data = await readFile(metadatFilepath);
      metaData = JSON.parse(data.toString());
    } 

  } catch(error) {
    console.log("Cannot find the metadata.json file at " + metadatFilepath);
    console.log(error);
  }
  
}

// WRITE CONFIG
async function writeConfig() {
  await writeFile(path.join(process.cwd(),'config.json'), JSON.stringify(config, null, 2));
}

async function getFilesForTrait(trait) {
  return (await readdir(path.join(basePath,trait))).filter(file => file !== '.DS_Store');
}
