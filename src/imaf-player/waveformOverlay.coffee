# a rect on top of waveforms, which handles dragging up and down
# to change the volume on them

d3 = require('prong/lib/prong/d3-prong-min')

module.exports = ->
    
    tracks = null
    width = null

    dragging = false
    dragStartY = null
    startVolume = null

    dispatch = d3.dispatch('volumeChange')

    dragmove = (track) ->
        if not dragging
            dragging = true
            dragStartY = d3.event.y - d3.event.dy
            startVolume = if track.volume != null then track.volume else 100
        dy = d3.event.y - dragStartY
        track.volume = Math.min(Math.max(0, startVolume - dy), 400)
        dispatch.volumeChange()


    dragend = (track) ->
        dragging = false


    drag = d3.behavior.drag()
        .on('drag', dragmove)
        .on('dragend', dragend)


    waveformOverlay = (container) ->
        container.selectAll('rect')
            .data(tracks)
            .enter()
            .append('rect')
            .attr('height', 59)
            .attr('width', width)
            .attr('y', (d, i) -> i * 60 + 30)
            .attr('x', 0)
            .attr('fill', 'transparent')
            .style('cursor','pointer')
            .call(drag)


    waveformOverlay.remove = (container) ->
        container.selectAll('rect').remove()


    waveformOverlay.tracks = (_tracks) ->
        if not arguments.length then return tracks;
        tracks = _tracks
        return waveformOverlay


    waveformOverlay.width = (_width) ->
        if not arguments.length then return width;
        width = _width
        return waveformOverlay


    waveformOverlay.on = (type, listener) ->
        dispatch.on(type, listener)
        return waveformOverlay


    return waveformOverlay
