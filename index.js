#!/usr/bin/env node

/**
 * @file index.js
 * @author Y3G
 */

var fs = require('fs');
var path = require('path');

var Promise = require('promise');
var program = require('commander');
var mkdirs = require('node-mkdirs');
var SVN = require('node.svn');
var Git = require("nodegit");
var zip = require('zip-folder');
var diff = require('dir-compare').compareSync;

require('./lib/date.format');

var fileUtils = require('./lib/fileUtils');
var cp = fileUtils.cp;
var rmrf = fileUtils.rmrf;

var exists = fileUtils.exists;
var isFile = fileUtils.isFile;
var isDir = fileUtils.isDir;

var $ = path.resolve.bind(path);

function errlog() {
	var args = Array.prototype.slice.call(arguments, 0);

	if (typeof args[0] === 'string') {
		args[0] = '[PACKR ERROR] ' + args[0];
	}

	console.error.apply(console, args);
}

function infolog() {
	var args = Array.prototype.slice.call(arguments, 0);

	if (typeof args[0] === 'string') {
		args[0] = '[PACKR INFO] ' + args[0];
	}

	console.info.apply(console, args);
}

function sectionlog() {
	var args = Array.prototype.slice.call(arguments, 0);

	if (typeof args[0] === 'string') {
		args[0] = '[PACKR SECTION] -------- ' + args[0];
	}

	console.info.apply(console, args);
}

function checkout(outPath, repo, version, callback) {
	var svn = new SVN(outPath);

	svn.co(repo + ' --depth=empty -r' + version, function (err) {
		if (err) {
			callback(err);
			return;
		}
		
		svn.up(['.', '-r' + version, '--set-depth', 'infinity'], callback);
	});
}

function gitCheckout(outPath, repo, version) {
	return Git.Clone(repo, outPath).then(function(repository){
		repository.getCommit(version).then(function(commit){
			Git.Reset.reset(repository, commit, Git.Reset.TYPE.HARD).then(function(){
				console.log('reset success')
			}).catch(function(err){
				console.log(err)
			})
		})

	})
}

function makeBundle(dir, zipname, callback) {
	infolog('zip files...');
	zip(dir, zipname, callback);
}

function makePatch(currentDir, lastDir, zipname, callback) {
	var patchDir = $(path.dirname(zipname), 'patch');
	var res = diff(currentDir, lastDir, {
		compareContent : true
	});
	var differences = res.diffSet.filter(function (el) {
		return (el.state !== 'equal' && el.type1 !== 'missing');
	});

	differences.forEach(function (el) {
		// relativePath开头带一个斜杠，会影响路径组合
		var rPath = el.relativePath.replace(/^[\\/]/, '');
		var rFilename = path.join(rPath, el.name1);
		var filename = $(currentDir, rFilename);
		
		if (!isFile(filename)) return;
		
		infolog('Find different file: ' + filename);
		
		var dstFilename = path.join(patchDir, rFilename);
		var err = cp(filename, dstFilename);
		
		if (err) {
			callback(err);
		}
	});

	zip(patchDir, zipname, callback);
}

(function main() {
	program.version('1.2.1')
		.option('-p, --prefix <string>', 'Output prefix')
		.option('-c, --current <n>', 'Current version')
		.option('-l, --last <n>', 'Last version')
		.option('-r, --repository <string>', 'Repository URL')
		.parse(process.argv);

	var prefix = program.prefix;
	var current = program.current;
	var last = program.last;
	var repo = program.repository;


	
	if (!repo || repo === '') {
		errlog('bad param(s)');
		return;
	}
	
	if (typeof last === 'undefined') {
		last = 'none';
	}
	
	if (current === last) {
		errlog('current equals to last');
		return;
	}

	// 时间戳
	var releaseTime = (new Date).format('yyMMddhhmmss');
	// 发布目录名
	var releaseDir = 'bundle_c' + current + '_l' + last + '_release' + releaseTime;
	// 发布文件名
	var releaseFilename = releaseDir + '.zip';
	
	infolog('Release file name: ' + releaseFilename);

	if (!prefix || prefix === '') {
		// 如果没有设置prefix，则使用当前目录
		prefix = './';
	}

	prefix = $(process.cwd(), prefix);
	prefix = $(prefix, releaseDir);

	try {
		if (fs.readdirSync(prefix).length) {
			errlog('dir ' + prefix + ' is NOT empty');
			return;
		}
	} catch (e) {
	}

	var currentVersionDir = $(prefix, '' + current);
	var lastVersionDir = $(prefix, '' + last);
	
	try {
		mkdirs(currentVersionDir);
		mkdirs(lastVersionDir);
	} catch (e) {
		errlog('mkdirs error', e);
		return;
	}
	
	new Promise(function (resolve, reject) {
		// checkout 新版本
		sectionlog('checkout current version...');
		gitCheckout(currentVersionDir, repo, current).then(function(){
			resolve();
		}).catch(function(err){
			reject(err)
		})
	}).then(function () {
		// checkout 老版本
		sectionlog('checkout last version...');
		
		return new Promise(function (resolve, reject) {
			if (last === 'none') {
				infolog('There is NO last version');
				resolve();
				return;
			}
			
			gitCheckout(lastVersionDir, repo, last).then(function(){
				resolve();
			}).catch(function(err){
				reject(err)
			})
		});
	}).then(function () {
		// 打全量压缩包
		sectionlog('make bundle...');
		
		return new Promise(function (resolve, reject) {
			makeBundle(currentVersionDir, $(prefix, 'bundle.zip'), function (err) {
				if (err) {
					reject(err);
					return;
				}
				
				resolve();
			});
		});
	}).then(function () {
		// 打增量压缩包
		sectionlog('make patch...');
		
		return new Promise(function (resolve, reject) {
			if (last === 'none') {
				infolog('There is NO last version');
				resolve();
				return;
			}

			makePatch(currentVersionDir, lastVersionDir, $(prefix, 'patch.zip'), function (err) {
				if (err) {
					reject(err);
					return;
				}
				
				resolve();
			});
		});
	}).then(function () {
		// 拷贝线上资源
		sectionlog('copy web resouces...');
		
		return new Promise(function (resolve, reject) {
			var err = fs.rename(currentVersionDir, $(prefix, 'web'), function (err) {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}).then(function () {
		// 生成update.json
		sectionlog('generate update.json...');

		return new Promise(function (resolve, reject) {
			var update = {
				releaseTime : releaseTime,
				version : current,
				lastVersion : (last === 'none') ? -1 : last
			};
			
			try {
				var updateStr = JSON.stringify(update);
				fs.writeFileSync($(prefix, 'update.json'), updateStr);
			} catch (err) {
				reject(err);
				return;
			}
			
			resolve();
		});
	}).then(function () {
		// 清理临时文件
		sectionlog('clean temp file...');

		return new Promise(function (resolve, reject) {
			var err = rmrf(lastVersionDir);

			if (err) {
				reject(err);
				return;
			}

			err = rmrf($(prefix, 'patch'));

			if (err) {
				reject(err);
				return;
			}

			resolve();
		});
	}).then(function () {
		// 打发布压缩包
		sectionlog('build release bundle...');

		return new Promise(function (resolve, reject) {
			var releasePath = prefix;
			var outDir = $(prefix, '..');

			zip(releasePath, $(outDir, releaseFilename), function (err) {
				if (err) {
					reject();
					return;
				}

				rmrf(releasePath);
				resolve();
			});
		});
	}).then(function () {
		infolog('build success');
	}, function (err) {
		errlog(err);
		errlog('build error');
	});
})();





