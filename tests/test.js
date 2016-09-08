/**
 * Created by ARVIND on 08-Sep-16.
 */
'use strict';
(function() {
    var childProcess = require("child_process");
    var oldSpawn = childProcess.spawn;
    function mySpawn() {
        console.log('spawn called');
        console.log(arguments);
        var result = oldSpawn.apply(this, arguments);
        return result;
    }
    childProcess.spawn = mySpawn;
})();
var exec = require('child_process').exec
    , spawn = require('child_process').spawn
    , path = require('path')
    , domain = require('domain')
    , d = domain.create()
    //, request = require('request')
    , fs = require('fs');

function log(message, tag) {
    var util = require('util')
        , color = require('cli-color')
        , tags, currentTag;

    tag = tag || 'info';

    tags = {
        error: color.red.bold,
        warn: color.yellow,
        info: color.cyanBright
    };

    currentTag = tags[tag] || function(str) { return str; };
    util.log((currentTag('[' + tag + '] ') + message).replace(/(\n|\r|\r\n)$/, ''));
}

(function mysqlDump(options, directory, callback) {
    var mysqldump
        , mysqlOptions;

    callback = callback || function() { };

    directory.replace(/\/$/, "");

    var cmd = 'mysqldump -u'+options.username+' -p'+options.password;

    if(options.hostname &&options.port){
        cmd += ' -h'+options.hostname+':'+options.port;
    }

    cmd += ' '+options.db+' > '+directory+'/'+options.db;

    log('Starting mysqldump of ' + options.db, 'info');
    mysqldump = exec(cmd);

    mysqldump.stdout.on('data', function (data) {
        log(data);
    });

    mysqldump.stderr.on('data', function (data) {
        log(data, 'error');
    });

    mysqldump.on('exit', function (code) {
        if(code === 0) {
            log('mysqldump executed successfully', 'info');
            callback(null);
        } else {
            callback(new Error('Mysqldump exited with code ' + code));
        }
    });
})({username: "root", password: "gohonzon97", db: "infotsav", host: false, port: false}, "C:\\Users\\ARVIND\\Desktop\\web", function (err) {
    console.log(err);
});