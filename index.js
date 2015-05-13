var express = require('express'),
    app = express(),
    browserify = require('browserify-middleware'),
    coffeeify = require('caching-coffeeify');

browserify.settings('extensions', ['.coffee','.js'])
browserify.settings('transform', coffeeify)

app.get('/js/imaf-player.js', browserify('../imaf-player/src/main.js'))
app.get('/js/mix.js', browserify('../imaf-player/src/mix-main.coffee'))
//app.get('/js/prong.js', browserify('node_modules/prong/lib/main.js'))
app.use(express.static(__dirname + '/public'));

module.exports = app;