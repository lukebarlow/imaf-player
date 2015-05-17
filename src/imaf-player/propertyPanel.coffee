commonProperties = require('prong/lib/prong/commonProperties')
Transport = require('prong/lib/prong/components/transport')
d3 = require('d3-prong')

module.exports = ->

    dispatch = d3.dispatch('openRemix', 'closeRemix')
    remixIsOpen = false

    propertyPanel = (selection) ->
        selection.style('opacity', 0)
        transport = Transport().sequence(propertyPanel.sequence())

        selection.append('div')
            .style('padding-top', '10px')
            .style('padding-left', '10px')
            .call(transport)

        selection.append('img')
            .attr('class','remixButton')
            .style('padding-top', '5px')
            .style('padding-left', '10px')
            .attr('width', 50)
            .attr('height', 50)
            .attr('src', './images/remix.png')
            .style('cursor', 'pointer')
            .on 'click', -> 
                remixIsOpen = not remixIsOpen
                if remixIsOpen
                    dispatch.openRemix()
                else
                    dispatch.closeRemix()
            

        selection.transition()
            .duration(500)
            .style('opacity', 1)


    propertyPanel.on = (type, listener) ->
        dispatch.on(type, listener)
        return propertyPanel


    return d3.rebind(propertyPanel, commonProperties(), 'sequence')



