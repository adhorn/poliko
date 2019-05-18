//
// Utility functions 
//

function b64Decode(data) {
    var binStr = atob(data),
        len = binStr.length,
        arr = new Uint8Array(len);

    for (var i = 0; i < len; i++) {
        arr[i] = binStr.charCodeAt(i);
    }

    return arr;
}

function toArrayBuffer(dataUrl) {
    return b64Decode(dataUrl.split(',')[1]).buffer;
}

function log(text) {
    const out = $('#output')[0];
    //  console.log(out);
    out.value += text
}

function clearLog(text) {
    const out = $('#output')[0];
    // console.log(out);
    out.value = "";
}

function ordinal_suffix_of(i) {
    var j = i % 10,
        k = i % 100;
    if (j == 1 && k != 11) {
        return i + "st";
    }
    if (j == 2 && k != 12) {
        return i + "nd";
    }
    if (j == 3 && k != 13) {
        return i + "rd";
    }
    return i + "th";
}

function speak(audioCtx, sound) {
    var source = audioCtx.createBufferSource();
    source.buffer = sound;
    source.connect(audioCtx.destination);
    source.start(0);
}

// 
// globals 
//
AWS.config.region = 'us-east-1'; // Region
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: 'us-east-1:5a8e773d-636b-41a8-a34b-a4bb2746624f',
});

window.AudioContext = window.AudioContext || window.webkitAudioContext;

var polly = new AWS.Polly();
var rekognition = new AWS.Rekognition();

//
// 
//
async function detectLabels(image) {

    return new Promise((resolve, reject) => {
        var params = {
            Image: {
                Bytes: image
            },
            MaxLabels: 20,
            MinConfidence: 50
        };

        console.log(params);

        log("Detecting labels with Rekognition.\n");

        rekognition.detectLabels(params, function (err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else {
                console.log(data);

                //Done with label output - go on next phase
                resolve(data.Labels);
            }
        });
    }); // new Promise()
}

async function generateSpeech(faces, labels) {

    return new Promise((resolve, reject) => {

        var toSpeak = "";

        log("Identified with greater than 50% confidence:\n");

        var text = "Hi, my name is Polly. In this picture I see " + faces.FaceDetails.length + " face" + (faces.FaceDetails.length != 1 ? "s" : "") + ". ";

        for (var i = 0; i < faces.FaceDetails.length; i++) {
            var face = faces.FaceDetails[i];

            text += "The " + ordinal_suffix_of(i + 1) + " face is a ";
            if (face["Emotions"]) {
                // filter the emotion with higher confidence 
                emotion = face["Emotions"].reduce((ac, cu) => { if (ac && ac.Confidence < cu.Confidence) { ac = cu; } return ac; });
                text += emotion.Type.toLowerCase() + " ";
            }
            if (face["Gender"]) text += face.Gender.Value.toLowerCase() + " ";
            else text += "person ";
            if (face["AgeRange"]) text += "between " + face.AgeRange.Low + " and " + face.AgeRange.High + " years old";

            text += ". ";
        }

        //log(text);

        var SKIP = ["Human", "People", "Person", "Crowd"];

        var toSpeak = "";
        var nums = 4;
        for (var i = 0; i < labels.length; i++) {

            log("   " + labels[i].Name + " (" + Math.round(labels[i].Confidence) + "%)\n");

            if (SKIP.indexOf(labels[i].Name) > -1) continue;

            if (nums > 0) {
                toSpeak += labels[i].Name.toLowerCase();
            }

            if (nums > 2) toSpeak += ", ";
            else if (nums == 2) toSpeak += " and ";

            nums--;
        };

        text += "I think I also see: " + toSpeak;

        log("Synthesizing speech for 4 first objects with Polly:\n    \"" + text + "\"\n");

        var params = {
            OutputFormat: "mp3",
            SampleRate: "16000",
            Text: text,
            TextType: "text",
            VoiceId: "Joanna"
        };

        polly.synthesizeSpeech(params, function (err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else {
                console.log(data);           // successful response
                let audioCtx = new AudioContext();
                audioCtx.decodeAudioData(data.AudioStream.buffer, function (buffer) {

                    if (navigator.userAgent.match(/(iPod|iPhone|iPad)/i)) {
                        $("#speakbutton").show();
                    }

                    speak(audioCtx, buffer);
                    resolve();
                });
            }
        });
    }); // new Promise
}

async function detectFaces(image) {

    return new Promise((resolve, reject) => {

        log("Detecting faces.\n");

        var params = {
            Image: {
                Bytes: image
            },
            Attributes: [
                'ALL'
            ]
        };
        rekognition.detectFaces(params, (err, data) => {
            if (err) {
                console.log("error detecting faces");
                console.log(err, err.stack); // an error occurred
            } else {
                console.log(data);           // successful response

                log("Found " + data.FaceDetails.length + " face(s).\n");

                var canvas = $("#canvas").get(0);
                var context2d = canvas.getContext("2d");

                for (var i = 0; i < data.FaceDetails.length; i++) {
                    var face = data.FaceDetails[i];
                    var box = face.BoundingBox;

                    log("Face " + (i + 1) + " attributes:\n");
                    log("    Age: " + face.AgeRange.Low + "-" + face.AgeRange.High + "\n");


                    if (face["Emotions"]) {
                        log("    Emotions: ");
                        for (var j = 0; j < face.Emotions.length; j++) {
                            var emo = face.Emotions[j];
                            if (j > 0) log(", ");
                            log(emo.Type + " (" + Math.round(emo.Confidence) + "%)");
                        };
                        log("\n");
                    };

                    ["Gender", "Smile", "Eyeglasses", "Beard", "Mustache"].forEach(function (attr) {
                        log("    " + attr + ": " + face[attr].Value + " (" + Math.round(face[attr].Confidence) + "%)\n");
                    });

                    context2d.save();
                    context2d.strokeStyle = "red";
                    context2d.lineWidth = Math.ceil(canvas.width / 800);
                    context2d.shadowColor = 'white';
                    context2d.shadowBlur = context2d.lineWidth * 2;
                    context2d.beginPath();
                    context2d.moveTo(box.Left * canvas.width, box.Top * canvas.height);
                    context2d.lineTo((box.Left + box.Width) * canvas.width, box.Top * canvas.height);
                    context2d.lineTo((box.Left + box.Width) * canvas.width, (box.Top + box.Height) * canvas.height);
                    context2d.lineTo(box.Left * canvas.width, (box.Top + box.Height) * canvas.height);
                    context2d.lineTo(box.Left * canvas.width, box.Top * canvas.height);
                    context2d.stroke();

                    context2d.fillStyle = "red";
                    var fontSize = 25 * canvas.width / 800;
                    context2d.font = fontSize + "px Arial";
                    context2d.fillText((i + 1), (box.Left * canvas.width) + 2, (box.Top * canvas.height) + fontSize);
                    context2d.restore();
                };

                let imageTag = $('#img')[0];
                imageTag.src = canvas.toDataURL("image/jpeg");

                resolve(data);
            }
        });
    }); // new Promise()
}

//
// image manipulations 
// 


// Function to check orientation of image from EXIF metadatas and draw canvas
async function orientation(img, canvas) {

    return new Promise((resolve, reject) => {

        // Set variables
        var ctx = canvas.getContext("2d");
        var exifOrientation = '';
        var width = img.width,
            height = img.height;

        console.log(width);
        console.log(height);

        // Check orientation in EXIF metadatas
        EXIF.getData(img, function () {
            var allMetaData = EXIF.getAllTags(this);
            exifOrientation = allMetaData.Orientation;
            console.log('Exif orientation: ' + exifOrientation);

            // set proper canvas dimensions before transform & export
            if (jQuery.inArray(exifOrientation, [5, 6, 7, 8]) > -1) {
                canvas.width = height;
                canvas.height = width;
            } else {
                canvas.width = width;
                canvas.height = height;
            }

            // transform context before drawing image
            switch (exifOrientation) {
                case 2:
                    ctx.transform(-1, 0, 0, 1, width, 0);
                    break;
                case 3:
                    ctx.transform(-1, 0, 0, -1, width, height);
                    break;
                case 4:
                    ctx.transform(1, 0, 0, -1, 0, height);
                    break;
                case 5:
                    ctx.transform(0, 1, 1, 0, 0, 0);
                    break;
                case 6:
                    ctx.transform(0, 1, -1, 0, height, 0);
                    break;
                case 7:
                    ctx.transform(0, -1, -1, 0, height, width);
                    break;
                case 8:
                    ctx.transform(0, -1, 1, 0, 0, width);
                    break;
                default:
                    ctx.transform(1, 0, 0, 1, 0, 0);
            }

            // Draw img into canvas
            ctx.drawImage(img, 0, 0, width, height);

            resolve();
        });
    }); // new Promise()
}

/**
 * Create a filereader from input selected files
 * Then do a preview by updating an img source
 * Finally check EXIF orientation drawing it into a canvas
 */
async function readFile() {

    return new Promise((resolve, reject) => {

        console.log('readFile()');
        const input = $("#input")[0];

        // If file is loaded, create new FileReader
        if (input.files && input.files[0]) {

            // Create a FileReader
            var reader = new FileReader();

            // Set onloadend function on reader
            reader.onloadend = function (e) {

                // Update an image tag with loaded image source
                $('#img').attr('src', e.target.result);

                // Use EXIF library to handle the loaded image exif orientation
                EXIF.getData(input.files[0], async function () {

                    // Fetch image tag
                    var img = $("#img").get(0);
                    
                    // Fetch canvas tag
                    var canvas = $("#canvas").get(0);

                    // run orientation on img in canvas
                    await orientation(img, canvas);

                    // insert the canvas on the image (not necessary to draw the image)
                    // but we are going to reuse the canvas later to draw the detection box
                    // let imageTag = $('#img')[0];
                    // imageTag.src = canvas.toDataURL("image/jpeg");

                    // remove image container background
                    const imageContainer = $('#img-container');
                    imageContainer.css({ 'background': '' });

                    image = toArrayBuffer(canvas.toDataURL("image/jpeg"));
                    resolve(image);
                });
            };

            // Trigger reader to read the file input
            reader.readAsDataURL(input.files[0]);
        }
    }); // new Promise()

}

// 
// Main entry point
//
async function handle() {
    let image = await readFile()
    let labels = await detectLabels(image);
    let faces = await detectFaces(image);
    await generateSpeech(faces, labels);
}
