d3 = require('d3-prong')

module.exports = (el) ->
    if 'node' or el then el = el.node()
    body = d3.select('body').node()
    x = 0
    y = 0
    while el != null and el != body and d3.select(el).style('position') != 'absolute'
        x += el.offsetLeft or el.clientLeft
        y += el.offsetTop or el.clientTop
        el = el.offsetParent or el.parentNode
    return [x, y]