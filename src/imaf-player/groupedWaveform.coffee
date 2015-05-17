commonProperties = require('prong/lib/prong/commonProperties')
downsample = require('prong/lib/prong/analysis/downsample')
uid = require('prong/lib/prong/uid')
d3 = require('d3-prong')
stack = require('./stack')
WaveformOverlay = require('./waveformOverlay')

# component for drawing waveforms in an svg element
module.exports = ->

    startOffset = 0
    verticalZoom = 1

    # There are 3 slightly different ways of drawing the waveform, which depend
    # on the zoom level. These parameters are in units of 'samples per pixel'
    # and can be used to determine the switchover between drawing modes
    DISPLAY_ABOVE_AND_BELOW_CUTOFF = 10
    DISPLAY_AS_LINE_CUTOFF = 1
    WIDE_ZOOM = 10000
    MEDIUM_ZOOM = 4000

    waveform = ->
        selection = this
        draw = ->

            selection.each (tracks) ->

                zoomLevels = [WIDE_ZOOM, MEDIUM_ZOOM]

                calculateStacks = ->
                    # now calculate the cumulative heights at each point
                    for zoom in zoomLevels
                        values = tracks.map (track) -> 
                            track._cache[zoom].map (v) -> 
                                v * track.volume / 100

                        baselines = stack(values)
                        for baseline, i in baselines
                            tracks[i]._stackCache[zoom] = baseline

                        
                if not tracks[0]._cache
                    # create caches for different zoom levels
                    for track in tracks
                        track._cache = {}
                        track._stackCache = {}
                        for zoom in zoomLevels
                            track._cache[zoom] = downsample(track._channel, zoom).map(Math.abs)

                    calculateStacks()
                    
                    
                sel = d3.select(this)

                x = waveform.x()
                domain = x.domain()
                range = x.range()
                #channel = d._channel
                sampleRate = tracks[0]._buffer.sampleRate
                startOffset = 0
                length = null

                tracks.clipStart = 0
                tracks.clipEnd = tracks[0]._channel.length / sampleRate
                tracks.startTime = 0

                length = tracks.clipEnd - tracks.clipStart
                clipDomain = [tracks.clipStart, tracks.clipEnd]
                clipRange = [tracks.startTime, tracks.startTime + length]
                clipScale = d3.scale.linear().range(clipRange).domain(clipDomain)
                clipStart = tracks.clipStart
                viewStart = clipStart + Math.max(domain[0] - tracks.startTime, 0)
                viewEnd = tracks.clipEnd - Math.max(tracks.startTime + length - domain[1], 0)

                # clear any previous areas and lines
                sel.selectAll('.area').remove()
                sel.selectAll('.line').remove()

                # if the waveform is out of view, then nothing more to do
                if (viewStart > viewEnd) then return

                width = waveform.width()
                height = waveform.height() || 128
                samplesPerPixel = Math.max(~~((Math.abs(domain[1] - domain[0]) * sampleRate) / width), 1)

                sampleStart = viewStart * sampleRate
                sampleEnd = viewEnd * sampleRate

                # we cache the thinned data at two levels, so zooming is
                # faster
                zoom = if samplesPerPixel >= WIDE_ZOOM then WIDE_ZOOM else MEDIUM_ZOOM
                samplesPerPixel = zoom

                start = sampleStart / zoom
                end = sampleEnd / zoom
                values = tracks.map (track) -> track._cache[zoom].slice(start, end)
                baselines = tracks.map (track) -> track._stackCache[zoom].slice(start, end)
                #data = [0...tracks.length].map (i) -> {values : values[i], baseline : baselines[i]}

                length = baselines[0].length

                verticalZoom = 6

                y = d3.scale.linear()
                    .range([height,0])
                    .domain([tracks.length / verticalZoom, -tracks.length / verticalZoom])

                translateX = 0

                sampleX = (d, i) ->
                    x(clipScale(i*samplesPerPixel/sampleRate + viewStart))
                
                # when zoomed out, we do it with an area...
                #if samplesPerPixel > DISPLAY_AS_LINE_CUTOFF
                stackedArea = (i) ->
                    d3.svg.area()
                        .x(sampleX)
                        .y0((e, j) -> y(baselines[i][j]))
                        .y1((e, j) -> y(baselines[i][j] + values[i][j] * tracks[i].volume / 100))

                area = (i) ->
                    d3.svg.area()
                        .x(sampleX)
                        .y0((e, j) -> y(-values[i][j] * tracks[i].volume / 100))
                        .y1((e, j) -> y(values[i][j] * tracks[i].volume / 100))

                sel.html('')

                colours = [
                    'rgba(0,136,204,0.4)',
                    'rgba(0,136,204,0.7)',
                    'rgba(0,136,204,1)'
                ]

                colours = d3.scale.category10()

                paths = sel.selectAll('path')
                    .data(tracks)
                    .enter()
                    .append('path')
                    #.attr('fill', (track, i) -> colours[i % colours.length])
                    .attr('fill', (track, i) -> colours(i))
                    .attr 'd', (track, i) -> 
                        stackedArea(i)(d3.range(length))
                    
                waveformOverlay = WaveformOverlay()
                    .tracks(tracks)
                    .width(width)
                    .on 'volumeChange', (track) ->
                        selection.selectAll('path')
                            .attr 'd', (track, i) ->
                                area(i)(d3.range(length))

                waveform.expand = ->
                    selection = this
                    selection.each (tracks) ->
                        container = d3.select(this)
                        container.attr('height', '500px')
                        container.selectAll('path')
                            .attr('transform', 'translate(0,0)')
                            .transition()
                            .duration(1000)
                            .attr('transform', (d, i) -> "translate(0, #{i * 60})")
                            .attr 'd', (track, i) ->
                                area(i)(d3.range(length))

                        container.call(waveformOverlay)

                waveform.contract = ->
                    calculateStacks()
                    baselines = tracks.map (track) -> track._stackCache[zoom].slice(start, end)
                    selection = this
                    selection.each (tracks) ->
                        container = d3.select(this)
                        container.selectAll('path')
                            .transition()
                            .duration(1000)
                            .attr('transform', 'translate(0,0)')
                            .attr 'd', (track, i) ->
                                stackedArea(i)(d3.range(length))

                        waveformOverlay.remove(container)
                    

        draw()

        timeline = waveform.timeline()

        if timeline
            # this timing logic tries to keep waveform redrawing as smooth
            # as possible. It times how long it takes to redraw the waveform
            # and makes sure not to redraw more frequently than that

            lastTimeout = null
            drawingTime = null
            lastDrawingStart = null

            drawAndTime = ->
                start = new Date()
                draw()
                drawingTime = new Date() - start
            
            timeline.on 'change.' + uid(), ->
                if (lastTimeout) then clearTimeout(lastTimeout)
                if (not lastDrawingStart) or (new Date() - lastDrawingStart) > (drawingTime * 2)
                    drawAndTime()
                else
                    after = ->
                        drawAndTime()
                        lastTimeout = null
                    lastTimeout = setTimeout(after, 50) 


    
    # getter/setter for vertical zoom
    waveform.verticalZoom = (_verticalZoom) ->
        if not arguments.length then return verticalZoom;
        verticalZoom = _verticalZoom
        return waveform
    
    # inherit properties from the commonProperties
    return d3.rebind(waveform, commonProperties(), 'x', 'width', 'height', 'timeline')