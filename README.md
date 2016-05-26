# Node MongoDB and Redis to S3 Backup

This is a package that makes backing up your mongo and redis databases to S3 simple.
The binary file is a node cronjob that runs at user specified time and backs up
the database specified in the config file.

## Installation

    npm install -g db-s3-backup

## Configuration

To configure the backup, you need to pass the binary a JSON configuration file.
There is a sample configuration file supplied in the package (`config.sample.json`).
The file should have the following format:

    {
      "mongodb": {
        "host": "localhost",
        "port": 27017,
        "username": false,
        "password": false,
        "db": "database_to_backup"
      },
      "s3": {
        "mongo": {
          "key": "your_s3_key",
          "secret": "your_s3_secret",
          "bucket": "s3_bucket_to_upload_to",
          "destination": "/mongo",
          "encrypt": true,
        },
        "redis": {
          "key": "your_s3_key",
          "secret": "your_s3_secret",
          "bucket": "s3_bucket_to_upload_to",
          "destination": "/redis",
          "encrypt": true,
        }
      },
      "cron": {
        "time": "11:59",
      },
      "webhook": {
        "url": "webhook_request_url",
        "channel": "channel_name",
        "username": "username",
        "emoji": "emoji"
      },
      "redis": {
        "path": "absolute_path_to_redisdump",
        "name": "archive_name_over_s3"
      }
    }

### Crontabs

You may optionally substitute the cron "time" field with an explicit "crontab"
of the standard format `0 0 * * *`.

      "cron": {
        "crontab": "0 0 * * *"
      }

*Note*: The version of cron that we run supports a sixth digit (which is in seconds) if
you need it.

### Timezones

The optional "timezone" allows you to specify timezone-relative time regardless
of local timezone on the host machine.

      "cron": {
        "time": "00:00",
        "timezone": "America/New_York"
      }

You must first `npm install time` to use "timezone" specification.

## Running

To start a long-running process with scheduled cron job:

    db-s3-backup <path to config file>

To execute a backup immediately and exit:

    db-s3-backup -n <path to config file>

Alternatively (using config.json in root folder)
    npm start
