function b64Decode(data) {
    var binStr = atob( data ),
        len = binStr.length,
        arr = new Uint8Array(len);

    for (var i = 0; i < len; i++ ) {
        arr[i] = binStr.charCodeAt(i);
    }

    return arr;
}

function toArrayBuffer(dataUrl) {
    return b64Decode( dataUrl.split(',')[1] ).buffer;
}

 function log(text) {
     document.getElementById('output').value += text
 }

 function clearLog(text) {
     document.getElementById('output').value = "";
 }

 AWS.config.region = 'us-east-1'; // Region
 AWS.config.credentials = new AWS.CognitoIdentityCredentials({
     IdentityPoolId: 'REPLACE_ME',
 });

 window.AudioContext = window.AudioContext || window.webkitAudioContext;
 var audioCtx = new AudioContext();
 var sound; //generated audio buffer

 var polly = new AWS.Polly();
 var rekognition = new AWS.Rekognition();

 var labels;
 var faces;

 var image;
 var imageTag;
 var canvas;

 function detectLabels() {

     var params = {
         Image: {
             Bytes: image
         },
         MaxLabels: 20,
         MinConfidence: 50
     };

     console.log(params);

     log("Detecting labels with Rekognition.\n");

     rekognition.detectLabels(params, function(err, data) {
         if (err) console.log(err, err.stack); // an error occurred
         else {
             labels = data.Labels;

             console.log(data);


             //Done with label output - detect faces
             detectFaces();
         }
     });
 }

 function generateSpeech() {

    var toSpeak = "";

    log("Identified with greater than 50% confidence:\n");


    var text = "Hi, my name is Polly. In this picture I see " + faces.FaceDetails.length + " face" + (faces.FaceDetails.length!=1?"s" : "") +". ";

    for(var i=0; i<faces.FaceDetails.length; i++) {
        var face = faces.FaceDetails[i];
        
        text += "The " + ordinal_suffix_of(i+1) + " face is a ";
        if(face["Emotions"]) text += face["Emotions"][0].Type.toLowerCase() + " ";
        if(face["Gender"]) text += face.Gender.Value.toLowerCase() + " ";
        else text += "person ";
        if(face["AgeRange"]) text += "between " + face.AgeRange.Low + " and " + face.AgeRange.High + " years old";

        text += ". ";
    }

    //log(text);

    var SKIP = ["Human", "People", "Person", "Crowd"];

    var toSpeak = "";
    var nums = 4;
    for(var i=0; i<labels.length; i++) {

        log("   " + labels[i].Name + " (" + Math.round(labels[i].Confidence) + "%)\n");

        if(SKIP.indexOf(labels[i].Name) > -1) continue;

        if(nums>0) {
            toSpeak += labels[i].Name.toLowerCase();
        }

        if(nums>2) toSpeak += ", ";
        else if(nums==2) toSpeak += " and ";

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

     polly.synthesizeSpeech(params, function(err, data) {
         if (err) console.log(err, err.stack); // an error occurred
         else {
             console.log(data);           // successful response
             audioCtx.decodeAudioData(data.AudioStream.buffer, function(buffer) {
                 sound = buffer;

                 if (navigator.userAgent.match(/(iPod|iPhone|iPad)/i)) {
                     $("#speakbutton").show();
                 }

                 speak();
             });
         }
     });

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

 function speak() {
     var source = audioCtx.createBufferSource();
     source.buffer = sound;
     source.connect(audioCtx.destination);
     source.start(0);
 }


 function detectFaces() {

     log("Detecting faces.\n");

     var params = {
         Image: {
             Bytes: image
         },
         Attributes: [
             'ALL'
         ]
     };
     rekognition.detectFaces(params, function(err, data) {
         if (err) console.log(err, err.stack); // an error occurred
         else {
             console.log(data);           // successful response

             faces = data;

             log("Found " + data.FaceDetails.length + " faces.\n");

             //var canvas = document.getElementById("canvas");
             var context2d = canvas.getContext("2d");

             for(var i=0; i<data.FaceDetails.length; i++) {
                 var face = data.FaceDetails[i];
                 var box = face.BoundingBox;

                 log("Face " + (i+1) + " attributes:\n");
                 log("    Age: " + face.AgeRange.Low + "-" + face.AgeRange.High + "\n");


                 if(face["Emotions"]) {
                     log("    Emotions: ");
                     for(var j=0; j<face.Emotions.length; j++) {
                         var emo = face.Emotions[j];
                         if(j>0) log(", ");
                         log(emo.Type + " (" + Math.round(emo.Confidence) + "%)");
                     };
                     log("\n");
                 };

                 ["Gender", "Smile", "Eyeglasses", "Beard", "Mustache"].forEach(function(attr) { 
                     log("    " + attr + ": " + face[attr].Value + " (" + Math.round(face[attr].Confidence) + "%)\n");
                 });

                 context2d.save();
                 context2d.strokeStyle = "red";
                 context2d.lineWidth = Math.ceil(canvas.width/800);
                 context2d.shadowColor = 'white';
                 context2d.shadowBlur = context2d.lineWidth*2;
                 context2d.beginPath();
                 context2d.moveTo(box.Left * canvas.width, box.Top * canvas.height);
                 context2d.lineTo((box.Left+box.Width) * canvas.width, box.Top * canvas.height);
                 context2d.lineTo((box.Left+box.Width) * canvas.width, (box.Top+box.Height) * canvas.height);
                 context2d.lineTo(box.Left * canvas.width, (box.Top+box.Height) * canvas.height);
                 context2d.lineTo(box.Left * canvas.width, box.Top * canvas.height);
                 context2d.stroke();

                 context2d.fillStyle = "red";
                 var fontSize = 25 * canvas.width/800;
                 context2d.font =  fontSize + "px Arial";
                 context2d.fillText((i+1), (box.Left * canvas.width)+2, (box.Top * canvas.height) + fontSize);
                 context2d.restore();
             };

            imageTag.src = canvas.toDataURL("image/jpeg");

             //Generate speech
             generateSpeech();
         }
     });


 }


 function readFile() {

     //var canvas = document.getElementById("canvas");

     clearLog();

     if (this.files && this.files[0]) {

         var file = this.files[0];

         var FR = new FileReader();

         FR.addEventListener("load", function(e) {
            var img = new Image();
            img.src = e.target.result;
            img.onload = function() {

                var exif = EXIF.getData(img, function() {

                    var orientation = EXIF.getTag(this, "Orientation");
                    //drawImage(img, canvas, orientation);

                    canvas = document.createElement("canvas");
                    //hirezCanvas.width = 800;

                    drawImage(img, canvas, orientation);

                    imageTag = document.getElementById("img");
                    imageTag.src = canvas.toDataURL("image/jpeg");

                    image = toArrayBuffer(canvas.toDataURL("image/jpeg"));
                    detectLabels();
                });

            };
         });

         log("Reading picture.\n");
         FR.readAsDataURL( file );
     }
 }

 function drawImage(img, canvas, orientation) {
    var context2d = canvas.getContext("2d");

    if(orientation == 8 || orientation == 6) {
        canvas.height = img.width;
        canvas.width = img.height;
    } else {
        canvas.height = img.height;
        canvas.width = img.width;
    }

    if(orientation == 8) {
        context2d.setTransform(0, -1, 1, 0, 0, canvas.height);
        context2d.drawImage(img, 0, 0, canvas.height, canvas.width);
    } else if(orientation == 6) {
        context2d.setTransform(0, 1, -1, 0, canvas.width, 0);
        context2d.drawImage(img, 0, 0, canvas.height, canvas.width);
    } else {
        context2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    context2d.setTransform(1, 0, 0, 1, 0, 0);
 }
