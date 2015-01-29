# imaf-player

Work in progress on a small multi-track audio web page component. Demo is here

https://dl.dropboxusercontent.com/u/5613860/mix-tag/index.html

To compile to a single javasript file, run

browserify --extension=.coffee -t coffeeify ./src/mix-main.coffee > mix-max.js

Or for a minified version,

browserify --extension=.coffee -t coffeeify ./src/mix-main.coffee | node_modules/uglify-js/bin/uglifyjs > mix-min.js
