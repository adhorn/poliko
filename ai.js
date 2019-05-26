// 
// globals 
//
AWS.config.region = 'us-east-1'; // Region
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: 'us-east-1:5a8e773d-636b-41a8-a34b-a4bb2746624f',
});

var polly = new AWS.Polly();
var rekognition = new AWS.Rekognition();

var buffer; // the audio bits and bytes 

// https://stackoverflow.com/questions/29373563/audiocontext-on-safari
let AudioContext = window.AudioContext // Default
    || window.webkitAudioContext // Safari and old versions of Chrome
    || false;

if (!AudioContext) {

    // Web Audio API is not supported
    // Alert the user
    alert("Sorry, but the Web Audio API is not supported by your browser. Please, consider upgrading to the latest version or downloading Google Chrome or Mozilla Firefox");

}

$(document).ready(() => {

    // clean log 
    $("#output")[0].value = '';

    $('#inp')[0].onchange = async function (e) {
        // clean log 
        $("#output")[0].value = '';

        let canvas = document.getElementById('canvas');
        let image = await loadImageInCanvas(this.files[0], canvas);
        let labels = await detectLabels(image);
        let faces = await detectFaces(image, canvas);
        await generateSpeech(faces, labels);
    }
});


//
// AI Code
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
                console.log(data);  // successful response


                let ctx = new AudioContext();
                ctx.decodeAudioData(data.AudioStream.buffer, (buff) => {

                    console.log("Audio data decoded");

                    // enable the speak button, allowing customers to repeat the message (or play it on iOS)
                    $('#speakButton').prop('disabled', false);

                    //save audio in a global variable, allowing to replay 
                    buffer = buff;
                    speak();

                    resolve();
                });

            }
        });
    }); // new Promise
}

// play sound stored in the global audio 'buffer' variable
function speak() {
    let ctx = new AudioContext();
    let source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

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

                var context2d = canvas.getContext("2d");
                context2d.strokeStyle = "red";
                context2d.lineWidth = Math.ceil(canvas.width / 800);
                context2d.shadowColor = 'white';
                context2d.shadowBlur = context2d.lineWidth * 2;

                context2d.fillStyle = "red";
                var fontSize = 25 * canvas.width / 800;
                context2d.font = fontSize + "px Arial";

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

                    context2d.beginPath();
                    context2d.moveTo(box.Left * canvas.width, box.Top * canvas.height);
                    context2d.lineTo((box.Left + box.Width) * canvas.width, box.Top * canvas.height);
                    context2d.lineTo((box.Left + box.Width) * canvas.width, (box.Top + box.Height) * canvas.height);
                    context2d.lineTo(box.Left * canvas.width, (box.Top + box.Height) * canvas.height);
                    context2d.lineTo(box.Left * canvas.width, box.Top * canvas.height);
                    context2d.stroke();

                    context2d.fillText((i + 1), (box.Left * canvas.width) + 2, (box.Top * canvas.height) + fontSize);
                };

                resolve(data);
            }
        });
    }); // new Promise()
}

//
// image loading 
// 

// https://medium.com/wassa/handle-image-rotation-on-mobile-266b7bd5a1e6

async function loadImageInCanvas(file, canvas) {

    return new Promise((resolve, reject) => {

        var reader = new FileReader();
        reader.onloadend = function (e) {

            // set the image in an <img> tag to work with EXIF below
            var imageTag = $("<img />", {
                src: e.target.result,
                crossOrigin: "Anonymous"

            }).on("load", async () => {

                let img = imageTag[0];

                // Set variables
                var width = img.width,
                    height = img.height;

                console.log(width);
                console.log(height);

                // Check orientation in EXIF metadatas
                EXIF.getData(img, () => {
                    console.log(img);
                    let exif = EXIF.getAllTags(img);
                    console.log('Exif');
                    console.log(exif);

                    // set proper canvas dimensions before transform & export
                    if (exif && jQuery.inArray(exif.Orientation, [5, 6, 7, 8]) > -1) {
                        console.log("portrait");
                        canvas.width = height;
                        canvas.height = width;
                    } else {
                        console.log("landscape or unknown");
                        canvas.width = width;
                        canvas.height = height;
                    }

                    // transform context before drawing image
                    var ctx = canvas.getContext("2d");
                    switch (exif.Orientation) {
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
                            // no transformation
                            ctx.transform(1, 0, 0, 1, 0, 0);
                    }

                    // remove image container background and reset height to ensure the image will be displayed with correct proportions
                    const imageContainer = $('#canvas');
                    imageContainer.css({ 'background': '', 'height': '' });

                    // Draw img into canvas
                    ctx.drawImage(img, 0, 0, width, height);

                    //reset the context before sending to Rekognition (otherwise face's boundaries will be mismatched)
                    ctx.setTransform(1, 0, 0, 1, 0, 0);

                    //convert image to byte array, the format expected by Rekognition
                    let image = toArrayBuffer(canvas.toDataURL("image/jpeg"));

                    resolve(image);
                });
            });
        };
        reader.readAsDataURL(file);
    });
}

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