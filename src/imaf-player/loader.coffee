# some routines for loading an imaf file and reporting the progress
# in a single element as it goes. This is a wrapper around the .imaf decoder
# which is customised for a specific gui situation

imaf = require('./imaf')
async = require('async')

module.exports = (src, element, callback) ->

    messageContainer = element.append('div').attr('class','message')
    messageContainer.text('loading...')


    loaded = (error, tracks) ->

        # remove any non-audio tracks for now
        tracks = tracks.filter (track) -> track.type == 'audio'

        message = 'loaded, now decoding'
        messageContainer.text(message)

        tracksDecoded = 0
        updateMessage = ->
            messageContainer.text(message + " (#{tracksDecoded} of #{tracks.length})")

        # we run all the track loaders before creating the sequence
        loadTrack = (track, callback) ->
            track._loader null, ->
                tracksDecoded++
                updateMessage()
                callback()

        async.each tracks, loadTrack, ->
            messageContainer.text('all tracks decoded')
            callback(tracks)


    progress = (message) ->
        messageContainer.text(message)


    imaf(src, loaded, progress)




