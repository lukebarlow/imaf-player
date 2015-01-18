commonProperties = require('prong/commonProperties')
sound = require('prong/sound').sound
GroupedWaveform = require('./groupedWaveform')
d3 = require('prong/d3-prong-min')
async = require('async')
Uid = require('prong/uid')
AudioContext = require('prong/audioContext')

#Lines = require('../components/lines')
#Note = require('../components/note')

# audioTrack is responsible for drawing out the audio tracks. This is a
# container for different representations of audio (waveform and/or spectrogram)
module.exports = ->

    width = null
    dispatch = d3.dispatch('load')

    # gets the first non blank channel in a buffer
    getFirstNonBlankChannel = (buffer) ->
        nonBlankChannels = getNonBlankChannelIndexes(buffer)
        if (nonBlankChannels.length > 0)
            return buffer.getChannelData(nonBlankChannels[0])
    

    getNonBlankChannelIndexes = (buffer) ->
        nonBlankChannels = []
        for i in [0...buffer.numberOfChannels]
            channel = buffer.getChannelData(i)
            someNonZero = channel.some( (value) -> value > 0 )
            if someNonZero
                nonBlankChannels.push(i)    
        return nonBlankChannels


    # the default sound loader
    httpSoundLoader = (loadingMessage, callback) ->
        track = this
        
        onprogress = (message) ->
            loadingMessage.text(message)

        onloaded = (buffer) ->
            track._buffer = buffer
            track._channel = getFirstNonBlankChannel(track._buffer)
            callback()

        sound(track.src, onloaded, onprogress)


    setTrackColours = (tracks) ->
        colour = d3.scale.category10()
        tracks.forEach (track, i) ->
            track.colour = colour(i)
    

    groupedAudioTrack = (selection) ->

        selection.each (tracks,i) ->

            setTrackColours(tracks)
            div = d3.select(this)
            sequence = groupedAudioTrack.sequence()
            
            # TODO : fix the height logic
            #height = sequence.height()
            height = null

            for track in tracks
                if not ('_loader' of track)
                    if '_channel' of track
                        # if we already have a channel set, set a 'do nothing' loader
                        track._loader = (_,callback) -> callback()
                    else
                        track._loader = httpSoundLoader
            
            sequence = groupedAudioTrack.sequence()
            waveform = GroupedWaveform()
                .x(sequence.x())
                .height(height)
                .timeline(sequence.timeline())

            svg = div.html('').append('svg')
                .attr('height',height)
                .attr('width', '100%')
                .datum(tracks)
                .call(waveform)

            uid = Uid()

            sequence.on 'expand', ->
                svg.call(waveform.expand)

            sequence.on 'contract', ->
                svg.call(waveform.contract)


            sequence.on 'play.audio'+uid, ->
                audioOut = sequence.audioOut()
                if not audioOut then return
                audioContext = AudioContext()

                for track in tracks
                    if not 'volume' of track then track.volume = 1
                    if not 'pan' of track then track.pan = 0

                    source = audioContext.createBufferSource()
                    source.buffer = track._buffer
                    
                    gain = audioContext.createGain()
                    panner = audioContext.createPanner()

                    # volume
                    setVolume = ->
                        gain.gain.value = track.volume / 100.0
                    track.watch( 'volume', -> setVolume() )
                    setVolume()

                    # pan
                    setPan = ->
                        # pan numbers are between -64 and +63. We convert this
                        # into an angle in radians, and then into an x,y position
                        angle = track.pan / 64 * Math.PI * 0.5
                        x = Math.sin(angle) / 2
                        y = Math.cos(angle) / 2
                        panner.setPosition(x, y, 0)
                    track.watch('pan', -> setPan() )
                    setPan()

                    source.connect(gain)
                    gain.connect(panner)
                    panner.connect(audioOut)

                    timeOffset = sequence.currentTime() - (track.startTime || 0)
                    whenToStart = if timeOffset < 0 then audioContext.currentTime - timeOffset else 0
                    offset = if timeOffset > 0 then timeOffset else 0

                    source.start(whenToStart, offset)
                                    
                    track.source = source
                    track.gain = gain
            

            sequence.on 'stop.audio'+uid, ->
                for track in tracks
                    if (track.source)
                        track.source.stop(0)
                    delete track.source
    

    groupedAudioTrack.redraw = (selection, options) ->
        if options and options.addOnsets
            selection.each (d,i) ->
                onsets = Onsets()
                    .x(x)
                    .timeline(sequence.timeline())

                svg = d3.select(this).select('svg')
                svg.call(onsets)
    

    groupedAudioTrack.on = (type, listener) ->
        dispatch.on(type, listener)
        return groupedAudioTrack


    groupedAudioTrack.canBeGrouped = true


    return d3.rebind(groupedAudioTrack, commonProperties(), 'sequence','height')


