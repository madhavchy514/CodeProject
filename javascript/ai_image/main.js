process.env['TF_CPP_MIN_LOG_LEVEL'] = '2';

const tf = require('@tensorflow/tfjs-node');
const mobilenet = require('@tensorflow-models/mobilenet');
const fs = require('fs');

const img = 'img/komodo.jpeg';

async function see() {
  console.log("loading model...");
  const model = await mobilenet.load();
  
  console.log("reading image...");
  const imageBuffer = fs.readFileSync(img);

  console.log("formatting image...");
  const decoded = tf.node.decodeImage(imageBuffer, 3);
  const tfImage = tf.image.resizeNearestNeighbor(decoded, [224, 224]).toInt();

  console.log("analyzing image...");
  const predictions = await model.classify(tfImage);
  
  console.table(predictions);

  decoded.dispose();
  tfImage.dispose();
}

see();