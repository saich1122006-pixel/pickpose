const fs = require('fs');

const file = 'c:/Users/DELL/OneDrive/Desktop/projects/pickpose/script.js';
let content = fs.readFileSync(file, 'utf8');

// Generate 89 more poses to make it 100 total
const adjs = ["Executive", "Corporate", "Business", "Modern", "Creative", "Senior", "Junior", "Dynamic", "Confident", "Casual"];
const nouns = ["Portrait", "Stance", "Meeting", "Discussion", "Presentation", "Pitch", "Lead", "Walker", "Director", "Manager"];
const poses = ["male standing", "female standing", "male sitting", "female sitting", "male movement", "female movement"];
const imgs = [
    "images/crossed.png", "images/hip.png", "images/stride.png", 
    "images/stairs.png", "images/profile.png", "images/jump.png", 
    "images/crouch.png", "images/lean.png", "images/sprint.png", "images/men1.png"
];

let extraPoses = [];
for (let i = 12; i <= 100; i++) {
    const adj = adjs[Math.floor(Math.random() * adjs.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const cat = poses[Math.floor(Math.random() * poses.length)];
    const img = imgs[Math.floor(Math.random() * imgs.length)];
    
    extraPoses.push(`    { id: ${i}, title: "${adj} ${noun}", category: "${cat}", tags: ["professional", "${adj.toLowerCase()}", "${noun.toLowerCase()}"], images: ["${img}"] }`);
}

const currentArrayMatch = content.match(/const posesData = \[(.|\n)*?\];/);

if (currentArrayMatch) {
    let arrayContent = currentArrayMatch[0];
    let newArrayContent = arrayContent.replace('];', ',\n' + extraPoses.join(',\n') + '\n];');
    
    content = content.replace(arrayContent, newArrayContent);
    fs.writeFileSync(file, content);
    console.log('Successfully added 89 professional poses to script.js');
} else {
    console.error('Could not find posesData array');
}
