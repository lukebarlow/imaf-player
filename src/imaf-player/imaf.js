/* a CommonJS wrapper for Giacomo Herrero's AMIF parser
 see http://www.giacomoherrero.com/clientside/

This takes a url of an amif file, and returns the tracks in Prong format,
with the audio buffers already decoded

*/

var async = require('async');
var prong = require('prong');
var d3 = require('prong').d3;

module.exports = function(url, callback, onprogress){
    Parser.newFile(url, function(){
        window.Parser = Parser;
        Parser.parseContainer();
        async.mapSeries(
            d3.range(Parser.numberOfTracks),
            function(i, cb){
                var arrayBuffer = Parser.getArrayBufferTrack(i);
                var track = {
                    name : 'track ' + i,
                    type : 'audio',
                    _loader : function(loadingMessage, _cb){
                        var track = this;
                        if (loadingMessage){
                            loadingMessage.text('decoding...');
                        }
                        prong.audioContext().decodeAudioData(arrayBuffer, function(buffer){
                            track._buffer = buffer;
                            track._channel = buffer.getChannelData(0);
                            track.buffer = track._buffer;
                            track.channel = track._channel;
                            _cb();
                        })
                    }
                }
                cb(null, track);
            },
            function(error, tracks){
                /* got all the audio tracks. Now we parse the lyrics into an
                array that looks like
                
                [
                    { time : 0, text : 'All day' },
                    { time : 3, text : 'All long'},
                    { time : 5.5, text : 'Maryanne'}
                ]
 
                */

                Parser.parseLyrics();
                var lyricsData = [];
                var time = 0;
                for (var i = 0; i<Parser.lyricsArray.length; i++) {
                    lyricsData.push({
                        time : time,
                        text : Parser.lyricsArray[i]
                    })
                    time+=Parser.stts[Parser.textTrackNumber].entries[i].sampleDelta / 1000.0;
                }

                tracks.unshift({
                    type : 'text',
                    data : lyricsData
                })

                callback(null, tracks)
            }
        )
    }, onprogress)
}


var Parser = {

//*************************************************************//
    //Class that manages the parsing of the IMAF file.
    //This pseudo class could be implemented better, 
    //  using prototypes instead of literals for example.
    //
    //
    //*************************************************************//

totalSize: 0,
arrayBuffer: null,
container: null,
parsed:false,

//IMAF Boxes
ftyp: {size: 0, type: null, majorBrand: null, minorVersion: 0, compatibleBrands: []},
mdat: {size: 0, startData:0, endData:0, data: []},
moov: {size: 0},
mvhd: {size: 0, timescale:0, duration: 0, trackIDs: []},
trak: [],
tkhd: [ {size:0, trackID:0, duration:0, volume:0} ],
mdia: [ {size:0} ],
mdhd: [ {size:0, timescale:0, duration:0, language:0} ],
hdlr: [ {size:0, handler_type:0, name:null} ],
minf: [ {size:0} ],
mediaInfoHeader: [ {size:0, type:'', } ],
dinf: [ {size:0} ],
stbl: [ {size:0}],
stts: [ {size:0, entryCount:0, entries:[ {sampleCount:0, sampleDelta:0} ] } ],
stsd: [ {size:0} ],
stsc: [ {size:0, entryCount:0, entries: [{firstChunk:0, samplesPerChunk:0, sampleDescriptionIndex:0}]}],
stco: [{size:0, type:'', entryCount:0, chunkOffset:[]}],
sampleSize: [ {size:0, type:''} ],

numberOfTotalTracks:0, //Including text, etc.
numberOfTracks:0, //Only audio tracks
textTrackNumber:0, //Index of lyrics track in trak array.
hasLyrics:false,
lyricsArray:[], //Array of individual lyrics lines.

metaString:'', //String with XML metadata

offset: 0, //This is just so I can keep track of what I'm doing. Maybe it's better to add this as a local var.

imagesArrayOffsets:[],
imagesBuffers:[],

newFile: function(filename, callback, onprogress){
    var that=this;
    var oReq = new XMLHttpRequest();
    oReq.open("GET", filename, true);
    oReq.responseType = "arraybuffer";

    oReq.onload = function (oEvent) {
        var arrayBuffer = oReq.response; // 
        if (arrayBuffer) {
            that.arrayBuffer=arrayBuffer;
            var byteArray = new Uint8Array(arrayBuffer);
            that.container=byteArray;
        }
        if (callback) callback();
    };

    if (onprogress){
        oReq.onprogress = function(e){
            if (e.lengthComputable){
                var percent = 100 * e.loaded / e.total;
                onprogress('loading (' + parseInt(percent) + '%)');
            }
        }
    }

    oReq.send(null);
},

getInt16: function(startByte, endByte){
    var dataView = new DataView(this.arrayBuffer.slice(startByte,endByte));
    var str='';
    var tempStr='';
    for (var i = 0; i < endByte-startByte; i++) {
        tempStr+=dataView.getUint8(i).toString(16);

        if (tempStr.length!=2) {
            str+=0;
            str+=tempStr;
            tempStr='';
        }
        str+=tempStr;
        tempStr='';
    }
    return str;
},

range2Str: function(startByte,endByte){
    var str='';
    for (var i = startByte; i < endByte; i++) {
        str+=String.fromCharCode(this.container[i]);
    }
    return str;
},

parseContainer: function(callback){

    this.totalSize=this.arrayBuffer.byteLength;

    //FTYP - File Type Box
    this.ftyp.size=parseInt(this.getInt16(0,4),16);
    this.ftyp.majorBrand=this.range2Str(8,12);
    this.ftyp.minorVersion=this.range2Str(12,16);

    this.ftyp.compatibleBrands=this.range2Str(16,this.ftyp.size);
    var c=1;
    var length=this.ftyp.compatibleBrands.length/4;
    var tempArray=[];
    var compBrands=[];
    var j=0;
    for (var i = 0; i < length; i++) {
        tempArray[i]=this.ftyp.compatibleBrands.substring(4*i,(i*4+4));
    }
    this.ftyp.compatibleBrands=tempArray;
    this.offset=this.ftyp.size;

    //MDAT - Media Data Box
    //If size ==1 the actual size is described as largesize with 64 bits right after the boxtype.
    var tempSize=parseInt((this.getInt16(this.offset,this.offset+4)),16);
    if (tempSize==1){
        this.mdat.size=parseInt((this.getInt16(this.offset+8,this.offset+16)),16);
        var temp=this.getInt16(this.offset+8,this.offset+16);
        //console.log(temp);
        this.mdat.startData=this.offset+16;
        this.mdat.endData=this.offset+this.mdat.size;
    }else if(tempSize===0){
        //box extends to end of the file
    }
    else{
        this.mdat.size=tempSize;
    }

    this.offset+=this.mdat.size;
    this.mdat.endData=this.offset;

    //MOOV - Movie Box
    this.moov.size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
    this.offset+=8;

    //MVHD - Movie Header Box
    this.mvhd.size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
    this.offset+=20; //to exclude 4B version&flags, 4B sizebox, 4B type, 4B creat_time. 4B mod_time
    this.mvhd.timescale=parseInt((this.getInt16(this.offset,this.offset+4)),16);
    this.offset+=4; //add timescale
    this.mvhd.duration=parseInt((this.getInt16(this.offset,this.offset+4)),16);
    this.offset+=84; //ignores the rest of the fields.

    var trakN=0;

    while(this.offset<this.totalSize){
        var boxType=this.range2Str(this.offset+4,this.offset+8);

        switch(boxType){

            case 'trak':

                this.trak.push({});
                this.tkhd.push({});
                this.mdia.push({});
                this.mdhd.push({});
                this.hdlr.push({});
                this.minf.push({});
                this.mediaInfoHeader.push({});
                this.dinf.push({});
                this.stbl.push({});
                newStts=  {size:0, entryCount:0, entries:[ {sampleCount:0, sampleDelta:0} ] };

                this.stts.push(newStts);
                this.stsd.push({});

                newStsc= {size:0, entryCount:0, entries: [{firstChunk:0, samplesPerChunk:0, sampleDescriptionIndex:0}]};

                this.stsc.push(newStsc);
                newStco={size:0, type:'', entryCount:0, chunkOffset:[]};
                this.stco.push(newStco);
                this.sampleSize.push({});
                //TRAK - Track Box
                this.trak[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.offset+=4;
                this.trak[trakN].name=this.range2Str(this.offset,this.offset+4);
                this.offset+=4;

                //TKHD - Track Header Box
                this.tkhd[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.offset+=20; //skips flags, version, creat_time and mod_time
                this.tkhd[trakN].trackID=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.offset+=8; //skips reserved fields
                this.tkhd[trakN].duration=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.offset+=16; //skips reserved fields, layer and alt_groups
                this.tkhd[trakN].volume=parseInt((this.getInt16(this.offset,this.offset+2)),16); //check the spec to see what this actually means.
                this.offset+=48; //skips the rest

                //MDIA - Media Box
                this.mdia[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.offset+=8;

                //MDHD - Media Header Box
                this.mdhd[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.offset+=20;
                this.mdhd[trakN].timescale=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.mdhd[trakN].duration=parseInt((this.getInt16(this.offset+4,this.offset+8)),16);
                this.mdhd[trakN].language=parseInt((this.getInt16(this.offset,this.offset+2)),16); //This needs to be stored as strings
                this.offset+=12;

                //HDLR - Handler Reference Box
                this.hdlr[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                // this.hdlr[trakN].handler_type=this.range2Str(this.offset, this.offset+4); //The spec says that this should be int(32) but it's exactly the same as 'name'
                this.hdlr[trakN].name=this.range2Str(this.offset+16, this.offset+20);
                if (this.hdlr[trakN].name=='soun') {this.numberOfTracks++;}
                if (this.hdlr[trakN].name=='text') {this.textTrackNumber=trakN; this.hasLyrics=true;}
                this.offset+=this.hdlr[trakN].size;

                //MINF - Media Information Box
                this.minf[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.offset+=8;

                //MEDIA INFO HEADERS (smhd, hmhd, nmhd)
                this.mediaInfoHeader[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.mediaInfoHeader[trakN].type=this.range2Str(this.offset+4,this.offset+8);

                this.offset+=this.mediaInfoHeader[trakN].size;

                //DINF - Data Information Box
                this.dinf[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.offset+=this.dinf[trakN].size; //Skips the entire box

                //STBL - Sample Table Box
                this.stbl[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.offset+=8;

                //STTS - Decoding Time to Sample Box
                this.stts[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.stts[trakN].entryCount=parseInt((this.getInt16(this.offset+12,this.offset+16)),16);
                this.offset+=16;
                
                var entry={};
                for (i = 0; i < this.stts[trakN].entryCount; i++) {
                    entry={sampleCount: parseInt((this.getInt16(this.offset,this.offset+4)),16),
                            sampleDelta: parseInt((this.getInt16(this.offset+4,this.offset+8)),16)
                    };
                    this.stts[trakN].entries.push(entry);
                    this.offset+=8;
                }
                this.stts[trakN].entries.shift(); //I need to do this because otherwise the first element gets populated by zeros.

                //STSD - Sample Description Box
                this.stsd[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.offset+=this.stsd[trakN].size;

                //STSZ (STZ2) - Sample Size Box
                this.sampleSize[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.sampleSize[trakN].type=this.range2Str(this.offset+4,this.offset+8);

                if (this.sampleSize[trakN].type=='stsz') {
                    //implement

                }
                //else it gets ignored for now
                this.offset+=this.sampleSize[trakN].size;

                //STSC - Sample to Chunk Box
                this.stsc[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.stsc[trakN].entryCount=parseInt((this.getInt16(this.offset+12,this.offset+16)),16);
                this.offset+=16;

                for (i = 0; i < this.stsc[trakN].entryCount ; i++) {
                    entry={firstChunk: parseInt((this.getInt16(this.offset,this.offset+4)),16),
                            samplesPerChunk: parseInt((this.getInt16(this.offset+4,this.offset+8)),16),
                            sampleDescriptionIndex: parseInt((this.getInt16(this.offset+8,this.offset+12)),16)
                    };
                    this.stsc[trakN].entries.push(entry);
                    this.offset+=12;
                }
                this.stsc[trakN].entries.shift();

                //STCO (CO64) - Chunk Offset Box (64 Bit)
                this.stco[trakN].size=parseInt((this.getInt16(this.offset,this.offset+4)),16);
                this.stco[trakN].type=this.range2Str(this.offset+4,this.offset+8);
                this.stco[trakN].entryCount=parseInt((this.getInt16(this.offset+12,this.offset+16)),16);

                if (this.stco[trakN].type=='co64') {
                    for (i = 0; i < this.stco[trakN].entryCount; i++) {
                        this.stco[trakN].chunkOffset.push(parseInt((this.getInt16(this.offset+16,this.offset+24)),16));
                    }
                }
                else {
                    for (i = 0; i < this.stco[trakN].entryCount; i++) {
                        this.stco[trakN].chunkOffset.push(parseInt((this.getInt16(this.offset+16,this.offset+20)),16));
                    }
                }
                this.offset+=this.stco[trakN].size;
                trakN++;

            break;

            case 'grco':  //Right now it doesn't consider grouping or presets so all this info is skipped.
                this.offset+=parseInt((this.getInt16(this.offset,this.offset+4)),16);
            break;

            case 'prco':
                this.offset+=parseInt((this.getInt16(this.offset,this.offset+4)),16);
            break;

            case 'ruco':
                this.offset+=parseInt((this.getInt16(this.offset,this.offset+4)),16);
            break;

            case 'meta':
                this.offset+=parseInt((this.getInt16(this.offset,this.offset+4)),16);
        }

        this.numberOfTotalTracks=trakN;
        this.parsed=true;
    }
},

getArrayBufferTrack: function(tracknumber){
    offset=this.stco[tracknumber].chunkOffset[0];
    if (tracknumber==this.numberOfTotalTracks-1) {
        endByte=this.mdat.endData-1;
    } else{
        endByte=this.stco[tracknumber+1].chunkOffset[0];

    }
    arrayBuffer=this.arrayBuffer.slice(offset,endByte);
    
    return arrayBuffer;
},

parseLyrics: function(){
    var offset=this.stco[this.textTrackNumber].chunkOffset[0];
    var lineSize=0;
    var entryCount=(this.stts[this.textTrackNumber].entryCount);

    for (var i = 0; i < entryCount; i++) {
        lineSize=parseInt((this.getInt16(offset,offset+2)),16);
        offset+=2;
        this.lyricsArray[i]=this.range2Str(offset,offset+lineSize);
        offset+=lineSize;
        //hclr
        offset+=parseInt((this.getInt16(offset,offset+4)),16);
        //krok

        var krok = parseInt((this.getInt16(offset,offset+4)),16);
        offset+=parseInt((this.getInt16(offset,offset+4)),16);
    }
},

parseMetadata: function(){

    //There's quite a bit of hardcoding here. It only works if the metadata is located at the end of the file.
    //It is also technically wrong, as per the IMAF spec, the metadata for a song should be inside the moov box, 
    //but example songs have it in the meta box of the file.

    var offset=this.ftyp.size+this.mdat.size+this.moov.size;
    var tempSize=0;
    var tempType='';
    offset+=12;

    while (offset<this.totalSize) {
        tempType=this.range2Str(offset+4,offset+8);
        switch (tempType){
            case 'hdlr':
                tempSize=parseInt((this.getInt16(offset,offset+4)),16);
                offset+=tempSize;
            break;
            case 'iloc':
                tempSize=parseInt((this.getInt16(offset,offset+4)),16);
                var offsetSize=parseInt(this.getInt16(offset+12,offset+13).substring(0,1),16);
                var lengthSize=parseInt(this.getInt16(offset+12,offset+13).substring(1),16);
                var baseOffsetSize=parseInt(this.getInt16(offset+13,offset+14).substring(0,1),16);
                var reserved=parseInt(this.getInt16(offset+13,offset+14).substring(1),16);
                var itemCount=parseInt((this.getInt16(offset+14,offset+16)),16);
                for (var i=0;i<itemCount;i++){
                    var itemID=parseInt((this.getInt16(offset+16,offset+18)),16);
                    var dataReferenceIndex=parseInt((this.getInt16(offset+18,offset+20)),16);
                    var baseOffset=parseInt((this.getInt16(offset+20,offset+20+baseOffsetSize)),16);
                    var extentCount=parseInt((this.getInt16(offset+20+baseOffsetSize,offset+22+baseOffsetSize)),16);
                    for (var j=0;j<extentCount;j++){
                        var extentOffset=parseInt((this.getInt16(offset+22+baseOffsetSize,offset+22+offsetSize+baseOffsetSize)),16);
                        var extentLength=parseInt((this.getInt16(offset+22+offsetSize+baseOffsetSize,offset+22+offsetSize+baseOffsetSize+lengthSize)),16);
                    }
                    var itemInfo = {item_ID: itemID,data_reference_index:dataReferenceIndex,base_offset:baseOffset,extent_offset:extentOffset,extent_length:extentLength};
                    this.imagesArrayOffsets.push(itemInfo);
                    this.imagesBuffers.push(this.arrayBuffer.slice(extentOffset,extentOffset+extentLength));
                }
                offset+=tempSize;
            break;
            case 'dinf':
                tempSize=parseInt((this.getInt16(offset,offset+4)),16);
                offset+=tempSize;
            break;
            case 'iinf':
                tempSize=parseInt((this.getInt16(offset,offset+4)),16);
                offset+=tempSize;
            break;
            case 'xml ':
                tempSize=parseInt((this.getInt16(offset,offset+4)),16);
                this.metaString=this.range2Str(offset+8,offset+tempSize);
                offset+=tempSize;
            break;
        }
    }
}
};