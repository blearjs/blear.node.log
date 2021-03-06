/**
 * blear.node.log
 * @author ydr.me
 * @create 2016年06月04日14:09:36
 */


'use strict';

var util = require('util');
var glob = require('glob');
var later = require('later');
var fse = require('fs-extra');
var path = require('path');
var date = require('blear.utils.date');
var object = require('blear.utils.object');
var array = require('blear.utils.array');
var string = require('blear.utils.string');
var typeis = require('blear.utils.typeis');
var system = require('blear.node.system');
var console = require('blear.node.console');


/**
 * express 日志系统，尽可能的放在中间件的末尾
 * @returns {Function}
 * @private
 */
exports.expressMiddleware = function (options) {
    options = object.assign(true, {
        inject: {
            'request time': function () {
                return date.format('YYYY-MM-DD HH:mm:ss.SSS');
            },
            'request IP': function (req) {
                return req.ip;
            },
            'request URL': function (req) {
                return req.method + ' ' + req.protocol + '://' + req.headers.host + req.originalUrl;
            },
            'request headers': function (req) {
                return req.headers;
            },
            'request session': function (req) {
                return req.session;
            },
            'request query': function (req) {
                return req.query;
            },
            'request body': function (req) {
                return req.body;
            }
        }
    }, options);

    return function (err, req, res, next) {
        if (err && err instanceof Error) {
            object.each(options.inject, function (key, val) {
                if (typeis.Function(val)) {
                    err[key] = val(req, res);
                } else {
                    err[key] = val;
                }

                if (err[key] === undefined) {
                    delete err[key];
                }
            });

            console.error(err);
        }

        next(err);
    };
};


// ==========================================
// ==============[ functions ]===============
// ==========================================
exports.holdError = function (err) {
    if (err && err instanceof Error) {
        console.error(err);
    }
};


// ==========================================
// ================[ manage ]=================
// ==========================================
var REG_FORMAT = /\d{4}-\d{2}-\d{2}/;
var STR_FORMAT = 'YYYY-MM-DD';
/**
 * 日志管理
 * @param options
 * @param options.dirname {String} 日志的保存目录
 * @param [options.outLog=out.log] {String} out 日志
 * @param [options.errLog=err.log] {String} error 日志
 * @param [options.schedules] {Object} 定时器
 * @param [options.maxLength=7] {Number} 保留天数
 */
exports.manage = function (options) {
    options = object.assign({
        // 日志的保存目录
        dirname: null,
        outLog: 'out.log',
        errLog: 'err.log',
        // 每天 0 点切割日志
        schedules: [{
            h: [0],
            m: [0]
        }],
        // 只保留 7 天之内日志
        maxLength: 7
    }, options);

    if (!options.dirname) {
        throw new Error('log manage dirname option is EMPTY');
    }

    var list = [];

    list.push({
        src: options.outLog,
        dest: 'node-out-'
    });

    list.push({
        src: options.errLog,
        dest: 'node-err-'
    });

    later.date.localTime();
    later.setInterval(function () {
        // 传输日志
        array.each(list, function (index, item) {
            var srcPath = path.join(options.dirname, item.src);
            var complete = function () {
                try {
                    fse.writeFileSync(srcPath, '', 'utf8');
                } catch (err) {
                    // ignore
                }
            };
            var src = fse.createReadStream(srcPath);
            var today = new Date();
            var yestoday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
            var name = item.dest + date.format(STR_FORMAT, yestoday) + '.log';
            var dest = fse.createWriteStream(path.join(options.dirname, name));

            src
                .on('error', complete)
                .on('close', complete)
                .on('end', complete)
                .pipe(dest)
                .on('error', complete)
                .on('close', complete)
                .on('end', complete);
        });

        // 日志数量
        var logs = path.join(options.dirname, 'node-*.log');
        glob(logs, function (err, files) {
            if (err) {
                return console.error(err);
            }

            if (files.length <= options.maxLength) {
                return;
            }

            var now = Date.now();
            var deadTime = now - options.maxLength * 24 * 60 * 60 * 1000;

            files.forEach(function (file) {
                var basename = path.basename(file);
                var matches = basename.match(REG_FORMAT);

                if (!matches) {
                    return;
                }

                var datestr = matches[0];
                var time = new Date(datestr).getTime();

                if (time < deadTime) {
                    fse.remove(file, exports.holdError);
                }
            });
        });
    }, {
        schedules: options.schedules
    });
};
