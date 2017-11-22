var gulp = require('gulp');
var minimist = require('minimist');
var nconf = require('nconf');
var ora = require('ora');
var child_process = require('child_process');
var shell = require('shelljs');
var fs = require('fs');
var readdir = require('fs-readdir-promise');
var co = require('co');

require('gulp-awaitable-tasks')(gulp);

nconf.file({ file: "config.json" });
var knownOptions = {
  "without_tests": false,
  "without_db_origin": false
};

var options = minimist(process.argv.slice(2), knownOptions);
var instance = options.instance;

if(!instance){
  console.error("Especifique la instancia");
  process.exit();
}

var instance_name = instance;
var instance_dir = nconf.get('vagrant:dir_base') + instance_name + ".merxbp.loc";

var metadata = nconf.get('instances:'+instance);

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
    cwd: backup_dir,
    stdio: 'inherit',
    shell: true
  });

  promise3 = promiseFromChildProcess(spawnMv);
  ora.promise(promise3, {text:message});
  yield promise3;
  return;
});

gulp.task('change_files', ['delete_files_directories'], function () {
  message = "Modificando archivos config.php";
  spinner = ora(message).start();
  shell.cd(instance_dir);
  shell.sed("-i", metadata.dbconfig.db_host_name, "localhost", "config.php");
  shell.sed("-i", metadata.dbconfig.db_user_name, "root", "config.php");
  shell.sed("-i", metadata.dbconfig.db_password, "root", "config.php");
  shell.sed("-i", metadata.dbconfig.db_name, instance_name, "config.php");
  shell.sed("-i", instance_name+".sugarondemand.com", instance_name+".merxbp.loc", "config.php");
  shell.sed("-i", metadata.Elastic.host, "localhost", "config.php");
  spinner.succeed(message);

  message = "Borrando contenido de la carpeta cache";
  spinner.text = message;
  shell.rm("-rf", "cache/*");
  spinner.succeed(message);

  message = "Modificando archivos .htaccess";
  spinner.text = message;
  shell.sed("-i", "RewriteBase /", "RewriteBase /sugar/"+ instance_name+".merxbp.loc/", ".htaccess");
  spinner.succeed(message);
  spinner.stop();
});

gulp.task('restore_db', [
  'change_files'
], function* () {
  shell.cd(instance_dir);
  var vagrant_ssh_mysql = "vagrant ssh -c 'mysql -u root -proot ";
  // console.log(options.without_db_origin);
  if(!options.without_db_origin){
    message = "Eliminando bases de datos obsoleta origin";
    promise = promiseFromChildProcess(
      child_process.spawn(vagrant_ssh_mysql + '-e "DROP DATABASE '+instance_name+'_origin"' + "'", {
        shell: true
      })
    );
    ora.promise(promise, {text:message});
    yield promise;
  }

  message = "Eliminando bases de datos obsoleta de pruebas";
  promise = promiseFromChildProcess(
    child_process.spawn(vagrant_ssh_mysql + '-e "DROP DATABASE '+instance_name+'"' + "'", {
      shell: true
    })
  );
  ora.promise(promise, {text:message});
  yield promise;

  if(!options.without_db_origin){
    message = "Creando bases de datos nueva origin";
    promise = promiseFromChildProcess(
      child_process.spawn(vagrant_ssh_mysql + '-e "CREATE DATABASE '+instance_name+'_origin"' + "'", {
        shell: true
      })
    );
    ora.promise(promise, {text:message});
    yield promise;
  }

  message = "Creando bases de datos nueva para pruebas";
  promise = promiseFromChildProcess(
    child_process.spawn(vagrant_ssh_mysql + '-e "CREATE DATABASE '+instance_name+'"' + "'", {
      shell: true
    })
  );
  ora.promise(promise, {text:message});
  yield promise;

  message = "Restaurando base de datos de pruebas";
  command = vagrant_ssh_mysql + instance_name +" < /vagrant/"+instance_name+".merxbp.loc/sugar"+metadata.sugar_version+metadata.sugar_flavor+".sql'";
  promise = promiseFromChildProcess(
    child_process.spawn(command, {
      shell: true
    })
  );
  ora.promise(promise, {text:message});
  yield promise;

  if(!options.without_db_origin){
    message = "Restaurando base de datos de origin";
    command = vagrant_ssh_mysql + instance_name +"_origin < /vagrant/"+instance_name+".merxbp.loc/sugar"+metadata.sugar_version+metadata.sugar_flavor+".sql'";
    promise = promiseFromChildProcess(
      child_process.spawn(command, {
        shell: true
      })
    );
    ora.promise(promise, {text:message});
    yield promise;
  }

  if(metadata.dbconfig.db_scripts && metadata.dbconfig.db_scripts.length){
    message = "Ejecutando scripts para base de datos de pruebas";
    // spinner.text = message;
    scripts_file = instance_name + '_scripts.sql';
    scripts_file_path = instance_dir +'/'+ scripts_file;
    shell.rm("-rf", scripts_file_path);
    var scripts_sql = fs.createWriteStream(scripts_file_path, {
      flags: 'a'
    })
    metadata.dbconfig.db_scripts.forEach(function(script) {
      scripts_sql.write(script);
    });
    scripts_sql.end();

    command = vagrant_ssh_mysql + instance_name +" < /vagrant/"+instance_name+".merxbp.loc/"+scripts_file+"'";
    promise = promiseFromChildProcess(
      child_process.spawn(command, {
        shell: true
      })
    );
    ora.promise(promise, {text:message});
    yield promise;
    shell.rm("-rf", scripts_file_path);
  }
});

gulp.task('get_version', ['restore_db'], function* () {
  message = "Configurando version de desarrollo ...";
  spinner = ora(message).start();

  yield co(fetchLocalDirFromRemote);
  // console.log("instance_dir:",instance_dir);
  shell.cd(instance_dir);

  if(options.delete_git_directory){
    shell.rm("-rf", instance_dir + '/.git*');
  }

  message = "Configurando primer commit";
  spinner.text = message;
  shell.exec('touch .gitignore');
  shell.exec('git init');
  shell.exec('git add .gitignore');
  shell.exec('git commit -m "Primer commit"');
  shell.exec('echo "*" > .gitignore');
  shell.exec('git add .gitignore');
  shell.exec('git commit -m "Omitiendo archivos"');
  spinner.succeed(message);

  message = "Configurando repositorios remotos";
  spinner.text = message;
  shell.exec('git remote add local '+ nconf.get('github:local:dir'));
  shell.exec('git remote add origin git@github.com:'+nconf.get('github:user')+'/custom_sugarcrm.git');
  shell.exec('git remote add merx git@github.com:MerxBusinessPerformance/custom_sugarcrm.git');
  spinner.succeed(message);

  message = "Obteniendo cambios desde el repositorio local";
  spinner.text = message;
  var git_fetch_origin = yield promiseFromChildProcess(child_process.spawn('git', ['fetch', 'local', metadata.branch], {
    cwd: instance_dir,
    stdio: 'inherit'
  }));
  spinner.succeed(message);

  command = 'git checkout -b '+metadata.branch+' local/'+metadata.branch;
  shell.exec(command);

  spinner.succeed("Branch cambiado a " + metadata.branch);
});

gulp.task("delete_files_directories", ['get_version'],function* () {
  if(metadata.delete_files_directories && metadata.delete_files_directories.length){
    message = "Eliminando archivos.";
    var files_directories = metadata.delete_files_directories.join(" ");
    promise = promiseFromChildProcess(
      child_process.spawn('rm -rf '+files_directories, {
        cwd: instance_dir,
        shell: true
      })
    );
    ora.promise(promise, {text:message});
    yield promise;
    return;
  }
});

gulp.task('get_dependencies', ['delete_files_directories'], function* () {
  message = "Instanlando dependencias composer";
  command = "vagrant ssh -c 'cd /vagrant/"+instance_name+".merxbp.loc; composer install'";
  promise = promiseFromChildProcess(
    child_process.spawn(command, {
      cwd: instance_dir,
      shell: true,
      stdio: 'inherit'
    })
  );
  ora.promise(promise, {text:message});
  yield promise;

  message = "Instanlando dependencias npm";
  command = "vagrant ssh -c 'cd /vagrant/"+instance_name+".merxbp.loc; yarn'";
  promise = promiseFromChildProcess(
    child_process.spawn(command, {
      cwd: instance_dir,
      shell: true,
      stdio: 'inherit'
    })
  );
  ora.promise(promise, {text:message});
  yield promise;

});

gulp.task('repair_instance', ['get_dependencies'], function* () {
  message = "Reparando la instancia"
  command = "vagrant ssh -c 'cd /vagrant/"+instance_name+".merxbp.loc; php repair.php'";
  promise = promiseFromChildProcess(
    child_process.spawn(command, {
      cwd: instance_dir,
      shell: true,
      stdio: 'inherit'
    })
  );
  ora.promise(promise, {text:message});
  yield promise;
});

gulp.task('test', ['repair_instance'], function* () {
  if(options.without_tests){
    return
  }
  message = "Pruebas PHP";
  command = "vagrant ssh -c 'cd /vagrant/"+instance_name+".merxbp.loc/tests; ../vendor/phpunit/phpunit/phpunit'";
  promise = promiseFromChildProcess(
    child_process.spawn(command, {
      cwd: instance_dir,
      shell: true,
      stdio: 'inherit'
    })
  );
  // ora.promise(promise, {text:message});
  yield promise;

  message = "Pruebas JS";
  command = "vagrant ssh -c 'cd /vagrant/"+instance_name+".merxbp.loc/tests; grunt karma:ci'";
  promise = promiseFromChildProcess(
    child_process.spawn(command, {
      cwd: instance_dir,
      shell: true,
      stdio: 'inherit'
    })
  );
  // ora.promise(promise, {text:message});
  yield promise;
})

gulp.task('default', ['delete_directory', 'extract_files', 'change_files',
'restore_db','get_version','get_dependencies','repair_instance','test'
]);

function promiseFromChildProcess(child) {
  return new Promise(function (resolve, reject) {
      child.addListener("error", reject);
      child.addListener("exit", resolve);
  });
};

function *fetchLocalDirFromRemote() {
  spinner.text = "Actualizando repositorio local";
  var branch_validate = child_process.spawn(' git branch --list | grep ' + metadata.branch, {
    cwd: nconf.get('github:local:dir'),
    shell: true
  });
  var output = "";
  branch_validate.stdout.on('data', function (data) {
    output = data.toString().trim().replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').replace('* ', '');
    // console.log("output:", JSON.stringify(output));
  });
  var git_fetch_origin = yield promiseFromChildProcess(branch_validate);
  if(output && output === metadata.branch){
    // console.log("si tiene el branch");
    command = 'git checkout ' + metadata.branch;
    // console.log("command:" , command)
    var git_fetch_origin =  promiseFromChildProcess(child_process.spawn(command, {
      cwd: nconf.get('github:local:dir'),
      shell: true,
      stdio: 'inherit'
    }));
    yield git_fetch_origin;

    command = 'git pull ' + nconf.get('github:local:remote') + ' ' + metadata.branch
    // console.log("command:" , command)
    git_fetch_origin =  promiseFromChildProcess(child_process.spawn(command, {
      cwd: nconf.get('github:local:dir'),
      shell: true,
      stdio: 'inherit'
    }));
    yield git_fetch_origin;
  }
  else{
    // console.log("no tiene el branch");
    command = 'git fetch ' + nconf.get('github:local:remote') + ' ' + metadata.branch + '; git checkout -b ' + metadata.branch + ' ' + nconf.get('github:local:remote') + '/' + metadata.branch;
    // console.log("command:" , command)
    var git_fetch_origin = yield promiseFromChildProcess(child_process.spawn(command, {
      cwd: nconf.get('github:local:dir'),
      shell: true,
      stdio: 'inherit'
    }));
  }
  spinner.succeed("Repositorio local actualizado");
}
