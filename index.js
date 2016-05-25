'use strict';

var exec = require('child_process').exec
  , spawn = require('child_process').spawn
  , path = require('path')
  , domain = require('domain')
  , d = domain.create()
  , request = require('request')
  , fs = require('fs');

/**
 * log
 *
 * Logs a message to the console with a tag.
 *
 * @param message  the message to log
 * @param tag      (optional) the tag to log with.
 */
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

/**
 * getArchiveName
 *
 * Returns the archive name in database_YYYY_MM_DD.tar.gz format.
 *
 * @param databaseName   The name of the database
 */
function getArchiveName(databaseName) {
  var date = new Date()
    , datestring;

  datestring = [
    databaseName,
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getTime()
  ];

  return datestring.join('_') + '.tar.gz';
}

/* removeRF
 *
 * Remove a file or directory. (Recursive, forced)
 *
 * @param target       path to the file or directory
 * @param callback     callback(error)
 */
function removeRF(target, callback) {

  callback = callback || function() { };

  fs.exists(target, function(exists) {
    if (!exists) {
      return callback(null);
    }
    log('Removing ' + target, 'info');
    exec( 'rm -rf ' + target, callback);
  });
}

/**
 * mongoDump
 *
 * Calls mongodump on a specified database.
 *
 * @param options    MongoDB connection options [host, port, username, password, db]
 * @param directory  Directory to dump the database to
 * @param callback   callback(err)
 */
function mongoDump(options, directory, callback) {
  var mongodump
    , mongoOptions;

  callback = callback || function() { };

  mongoOptions= [
    '-h', options.host + ':' + options.port,
    '-d', options.db,
    '-o', directory
  ];

  if(options.username && options.password) {
    mongoOptions.push('-u');
    mongoOptions.push(options.username);

    mongoOptions.push('-p');
    mongoOptions.push(options.password);
  }

  log('Starting mongodump of ' + options.db, 'info');
  mongodump = spawn('mongodump', mongoOptions);

  mongodump.stdout.on('data', function (data) {
    log(data);
  });

  mongodump.stderr.on('data', function (data) {
    log(data, 'error');
  });

  mongodump.on('exit', function (code) {
    if(code === 0) {
      log('mongodump executed successfully', 'info');
      callback(null);
    } else {
      callback(new Error('Mongodump exited with code ' + code));
    }
  });
}

/**
 * compressDirectory
 *
 * Compressed the directory so we can upload it to S3.
 *
 * @param directory  current working directory
 * @param input     path to input file or directory
 * @param output     path to output archive
 * @param callback   callback(err)
 */
function compressDirectory(directory, input, output, callback) {
  var tar
    , tarOptions;

  callback = callback || function() { };

  tarOptions = [
    '-zcf',
    output,
    input
  ];

  log('Starting compression of ' + input + ' into ' + output, 'info');
  tar = spawn('tar', tarOptions, { cwd: directory });

  tar.stderr.on('data', function (data) {
    log(data, 'error');
  });

  tar.on('exit', function (code) {
    if(code === 0) {
      log('successfully compress directory', 'info');
      callback(null);
    } else {
      callback(new Error('Tar exited with code ' + code));
    }
  });
}

/**
 * sendToS3
 *
 * Sends a file or directory to S3.
 *
 * @param options   s3 options [key, secret, bucket]
 * @param directory directory containing file or directory to upload
 * @param target    file or directory to upload
 * @param callback  callback(err)
 */
function sendToS3(options, directory, target, callback) {
  var knox = require('knox')
    , sourceFile = path.join(directory, target)
    , s3client
    , destination = options.destination || '/'
    , headers = {};

  callback = callback || function() { };


  var knoxOption = {
    key: options.key,
    secret: options.secret,
    bucket: options.bucket,
    encrypt: options.encrypt
   }
  s3client = knox.createClient(options);

  if (options.encrypt)
    headers = {'x-amz-server-side-encryption': 'AES256'}

  log('Attemping to upload ' + target + ' to the ' + options.bucket + ' s3 bucket');
  s3client.putFile(sourceFile, path.join(destination, target), headers, function(err, res){
    if(err) {
      return callback(err);
    }

    res.setEncoding('utf8');

    res.on('data', function(chunk){
      if(res.statusCode !== 200) {
        log(chunk, 'error');
      } else {
        log(chunk);
      }
    });

    res.on('end', function(chunk) {
      if (res.statusCode !== 200) {
        return callback(new Error('Expected a 200 response from S3, got ' + res.statusCode));
      }
      log('Successfully uploaded to s3');
      return callback();
    });
  });
}

function copyFile(source, target, cb) {
  var cbCalled = false;

  var rd = fs.createReadStream(source);
  rd.on('error', function(err) {
    done(err);
  });
  var wr = fs.createWriteStream(target);
  wr.on('error', function(err) {
    done(err);
  });
  wr.on('close', function(ex) {
    done();
  });
  rd.pipe(wr);

  function done(err) {
    if (!cbCalled) {
      cb(err);
      cbCalled = true;
    }
  }
}



/**
 * sync
 *
 * Performs a mongodump on a specified database, gzips the data,
 * and uploads it to s3.
 *
 * @param mongodbConfig   mongodb config [host, port, username, password, db]
 * @param s3Config        s3 config [key, secret, bucket]
 * @param callback        callback(err)
 */
function sync(mongodbConfig, s3Config, webhookConfig, redisConfig, callback) {
  var tmpDir = path.join(require('os').tmpDir(), 'node_s3_backup')
    , async = require('async')
    , tmpDirCleanupFns;

  callback = callback || function() { };

  tmpDirCleanupFns = [
    async.apply(removeRF, tmpDir),
  ];

  var functionSequence = tmpDirCleanupFns.slice();
  if (mongodbConfig) {
    var backupDir = path.join(tmpDir, mongodbConfig.db)
    var archiveName = getArchiveName(mongodbConfig.db)
    functionSequence.push(async.apply(mongoDump, mongodbConfig, tmpDir),
    async.apply(compressDirectory, tmpDir, mongodbConfig.db, archiveName),
    d.bind(async.apply(sendToS3, s3Config.mongo, tmpDir, archiveName)));
  } else {
    functionSequence.push(async.apply(fs.mkdir, tmpDir))
  }

  if (redisConfig) {
    var redisBackupDir = path.join(tmpDir, redisConfig.name)
    var redisBackupPath = path.join(redisBackupDir, redisConfig.name)
    var redisArchiveName = getArchiveName(redisConfig.name)
    functionSequence.push(async.apply(fs.mkdir, redisBackupDir),
      async.apply(copyFile, redisConfig.path, redisBackupPath),
      async.apply(compressDirectory, tmpDir, redisConfig.name, redisArchiveName),
      d.bind(async.apply(sendToS3, s3Config.redis, tmpDir, redisArchiveName)));
  }
  async.series(functionSequence, function(err) {
    var options = {
      method: 'POST',
      url: webhookConfig.url,
      headers:
      {
        'content-type': 'application/x-www-form-urlencoded'
      }
    };
    if(err) {
      options.form =  { payload: '{"channel": "' + webhookConfig.channel + '", "username": "' + webhookConfig.username + '", "text": "Backup Un-successful" , "icon_emoji": "' + webhookConfig.emoji + '"}' }
      log(err, 'error');
    } else {
      options.form =  { payload: '{"channel": "' + webhookConfig.channel + '", "username": "' + webhookConfig.username + '", "text": "Backup Successful" , "icon_emoji": "' + webhookConfig.emoji + '"}' }
      log('Successfully backed up');
    }
    // cleanup folders
    async.series(tmpDirCleanupFns.concat([async.apply(request, options)]), function(err) {
      if (err) {
        log('Un-successful notified webhook');
        return callback(err);
      } else {
        log('Successfully notified webhook');
        return callback(err);
      }
    });
  });

  // this cleans up folders in case of EPIPE error from AWS connection
  d.on('error', function(err) {
      d.exit()
      async.series(tmpDirCleanupFns, function() {
        throw(err);
      });
  });

}

module.exports = { sync: sync, log: log };
