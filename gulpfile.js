var gulp = require('gulp');
var minimist = require('minimist');
var nconf = require('nconf');
var ora = require('ora');
var child_process = require('child_process');
var shell = require('shelljs');
var fs = require('fs');
var readdir = require('fs-readdir-promise');

require('gulp-awaitable-tasks')(gulp);

nconf.file({ file: "config.json" });
var knownOptions = {};

var options = minimist(process.argv.slice(2), knownOptions);
var instance = options.instance;

if(!instance){
  console.error("Especifique la instancia");
  process.exit();
}

var instance_name = instance;
var instance_dir = nconf.get('vagrant:dir_base') + instance_name + ".merxbp.loc";

var metadata = nconf.get('instances:'+instance);
var promiseFromChildProcess = function(child) {
  return new Promise(function (resolve, reject) {
      child.addListener("error", reject);
      child.addListener("exit", resolve);
  });
};

gulp.task("delete_directory", function* () {
  message = "Eliminando instancia obsoleta "+instance_name+".merxbp.loc";
  promise = promiseFromChildProcess(
    child_process.spawn('rm -rf '+instance_dir, {
      shell: true
    })
  );
  ora.promise(promise, {text:message});
  yield promise;
  return;
});

gulp.task("extract_files",[
  "delete_directory"
], function*() {
  message = "Extrayendo restore files";
  spinner = ora(message).start();

  shell.cd(metadata.backup_dir);
  var tar_dir = instance_name+".sugarondemand.com."+metadata.sugar_version+metadata.sugar_flavor+".*";
  pv = shell.which('pv');
  if (pv) {
    // console.log("Entrar para pv");
    spinner.stop();
    try {
       files = []
       shell.ls('*.gz').forEach(function (file) {
          files.push(file);
       });
       if(files.length === 1){
         promise = promiseFromChildProcess(
           child_process.spawn('pv '+files[0]+' | tar xzf - -C . ', {
             cwd: metadata.backup_dir,
             stdio: 'inherit',
             shell: true
           })
         );
         yield promise;
       }
    } catch (err) {
      console.error(`chdir: ${err}`);
    }
  }
  else{
    yield shell.exec("tar -zxvf "+ tar_dir + ".tar.gz");
  }
  spinner.succeed(message);
  spinner.stop();

  message = "Obteniendo carpeta de la instancia";
  var extracted_directory = "";
  promise = readdir(metadata.backup_dir).then(function(files){
    files.forEach(function (file) {
      if(file !=  '.DS_Store' && fs.lstatSync(file).isDirectory()){
        extracted_directory = file;
      }
    });
  });
  ora.promise(promise, {text:message});
  yield promise;

  message = "Moviendo carpeta de la instancia";
  backup_dir = metadata.backup_dir + '/' + extracted_directory;
  var command = "mv sugar" + metadata.sugar_version+metadata.sugar_flavor + " " + instance_dir;
  var spawnMv = child_process.spawn(command, {
    cwd: backup_dir,
    stdio: 'inherit',
    shell: true
  });
  promise2 = promiseFromChildProcess(spawnMv);
  ora.promise(promise2, {text:message});
  yield promise2;

  message = "Moviendo archivo SQL";
  spawnMv = child_process.spawn("mv sugar" + metadata.sugar_version+metadata.sugar_flavor + ".sql " + instance_dir, {
    cwd: metadata.backup_dir,
    stdio: 'inherit',
    shell: true
  });

  promise3 = promiseFromChildProcess(spawnMv);
  ora.promise(promise3, {text:message});
  yield promise3;
  return;
});

gulp.task('saludo', function () {
  console.log("saludo", options);

});

gulp.task('default', ['saludo', 'delete_directory', 'extract_files'])
