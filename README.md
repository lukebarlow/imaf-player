# imaf-player

Web player for multi-track IMAF files. A demo of the mix tag can be seen
here

https://dl.dropboxusercontent.com/u/5613860/mix-tag/index.html

To get the demo running on your machine

    git clone https://github.com/lukebarlow/imaf-player.git
    cd imaf-player
    npm install
    npm start

Once it's running, you can then hit the following two URLs for the two different
plauers

http://localhost:8091

http://localhost:8091/multitrack.html

As an alternative to 'npm start' which runs it in dev mode with source maps and
live transpiling of the source coffeescript, you can also use

    npm run prod

To run in production mode. This means it will compile and minify once to a much
smaller javascript file.

For faster development, you will probably want to copy the sample logan3.ima
file to your local machine. Download it by hitting

https://dl.dropboxusercontent.com/u/5613860/imaf/logan3.ima

and copying this to 'public/audio'. Then modify this path where it's found
in index.html and multitrack.html