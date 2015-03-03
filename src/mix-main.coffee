d3 = require('prong/lib/prong/d3-prong-min')

loader = require('./imaf-player/loader')
Sequence = require('./imaf-player/sequence')

d3.select(window).on 'load.imaf-player', ->
    mixes = d3.select('mix')
    mixes.each (d) ->
        tag = d3.select(this)
        
        src = tag.attr('src')
        type = src.split('.').pop()
        if type not in ['ima','imaf']
            tag.classed('warning', true)
            tag.html("Only files ending in <i>.ima</i> or <i>.imaf</i> are supported by the mix tag")
            return

        tag = tag.append('div')
        loader src, tag, (tracks) ->
            # TODO : figure out the x scale by inspecting width of element
            # and length of audio
            sequence = Sequence().tracks(tracks)
            tag.html('').call(sequence)