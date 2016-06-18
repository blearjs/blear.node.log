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


var pkg = require('../package.json');


// ==========================================
// ===============[ express ]================
// ==========================================
var namespace = path.basename(__filename) + ' of ' + pkg.name + '@' + pkg.version;


/**
 * express 日志系统，尽可能的放在中间件的最开始
 * @returns {Function}
 * @private
 */
exports.expressMiddlewareStart = function (options) {
    var ipKey = namespace + 'ip';
    options = object.assign({}, options);

    return function (req, res, next) {
        req.$fullURL = req.protocol + '://' + req.headers.host + req.url;

        var log = function (ip) {
            req.$ip = ip;
            console.info(console.colors.magenta(ip, req.method, req.$fullURL));
        };

        if (req.session[ipKey]) {
            log(req.session[ipKey]);
            next();
            return;
        }

        system.remoteIP(req, function (ip) {
            req.session[ipKey] = req.$ip = ip;
            log(ip);
            next();
        });
    };
};


/**
 * express 日志系统，尽可能的放在中间件的末尾
 * @returns {Function}
 * @private
 */
exports.expressMiddlewareEnd = function (options) {
    options = object.assign({
        inject: {}
    }, options);

    return function (err, req, res, next) {
        if (err && err instanceof Error) {
            err['request url'] = req.$fullURL;
            err['request ip'] = req.$ip;
            err['request headers'] = req.headers;

            if (req.query) {
                err['request query'] = req.query;
            }

            if (req.body) {
                err['request body'] = req.body;
            }

            if (req.file) {
                err['request file'] = req.file;
            }

            if (req.files) {
                err['request files'] = req.files;
            }

            if (req.session) {
                err['request session'] = req.session;
            }

            object.each(options.inject, function (key, val) {
                if (typeis.Function(val)) {
                    err[key] = val(req, res);
                } else {
                    err[key] = val;
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
            var complete = function () {
                fse.writeFile(item.src, '', 'utf8', exports.holdError);
            };
            var src = fse.createReadStream(path.join(options.dirname, item.src));
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
