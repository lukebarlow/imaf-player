var app = require('./'),
	port = 8091;

var server = app.listen(port);
app.init(server);

console.log('IMAF-player examples running at localhost:' + port);