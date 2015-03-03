###
 similar to d3.layout.stack, but optimised for typed arrays, and with less
 options. Rather than working with objects with x and y attributes, as the
 d3 stack does, this accepts a list of typed arrays, leaves the original
 arrays unchanged, and returns a second list of arrays with the baselines.
 Always centers the data, corresponding to the 'silhouette' option in d3
###

d3 = require('prong/lib/prong/d3-prong-min')

module.exports = (data) ->
    length = data[0].length
    baselines = data.map -> new Array(length)
    for i in [0...length]
        total = d3.sum(data, (d) -> Math.abs(d[i]))
        offset = 0 - total / 2
        for row, j in data
            baselines[j][i] = offset
            offset += row[i]

    return baselines
