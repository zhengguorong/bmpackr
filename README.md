# 静态资源打包工具（bmpackr）使用说明

## 综述

bmpackr 是专为移动 app 混合开发设计的 web 静态资源打包工具。

bmpackr 通过比较两个 git 版本的区别，将静态资源项目打包为全量更新包、增量更新包，以及线上资源目录，同时生成版本信息 update.json。


## 安装

```
npm install -g bmpackr
```

## 命令参数

bmpackr 命令格式如下：

```
bmpackr -p=${prefix} -c=${currentVersion} -l=${lastVersion} -r=${repositoryURL}
```

其中：

* prefix 为输出目录，如果不设置，则输出于当前目录。
* currentVersion 为当前发布版本的 svn 版本号。
* lastVersion 为上一个版本的 svn 版本号。
* repositoryURL 为 svn 版本库地址。

## 输出

bmpackr 输出为一个 zip 压缩包，其中有如下文件或目录：

* bundle.zip 新发布版本的全量更新包。
* patch.zip 增量更新包，其中有新增和改动过的文件。
* web 线上资源目录，供客户端或浏览器在不使用缓存时直接访问。
* update.json 版本信息文件，其中以 json 格式记录了新版本和上一个版本的版本号。

## 感谢
该工程基于ypackr修改，github地址：https://github.com/yusangeng/ypackr
