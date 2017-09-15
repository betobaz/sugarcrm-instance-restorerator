var co = require('co');
var prompt = require('co-prompt');
var program = require('commander');
var shell = require('shelljs');
var nconf = require('nconf');
var spawn = require('co-child-process');
var child_process = require('child_process');
var Promise = require('bluebird');
var fs = require('fs');
var colors = require('colors');
var ora = require('ora');
var spinner;

var metadata = null;
var instance_dir = null;
var instance_name = null;

nconf.file({ file: "config.json" });

program
.arguments('<instance>')
.option('-g, --git-only', 'Elimina la carpeta .git y obtiene cambios del repositorio remoto')
.option('-d, --database-only', 'Elimina la carpeta .git y obtiene cambios del repositorio remoto')
.option('-p, --test-php', 'Corre test PHP')
.option('-j, --test-js', 'Corre test JS')
.action(function(instance, command) {
  // console.log(program.databaseOnly);

  co(function *() {
    metadata = nconf.get('instances:'+instance);
    if(metadata){
      instance_name = instance;
      instance_dir = nconf.get('vagrant:dir_base') + instance_name + ".merxbp.loc";
      message =  "Iniciando restore "+instance+".merxbp.loc";
      spinner = ora(message).start();
      spinner.succeed(message);
      spinner.stop();
      if(program.gitOnly){
        yield co(obtenerVersion);
      }else if(program.databaseOnly){
        yield co(restaurarDB);
      }else if(program.testPhp || program.testJs){
        yield co(sugarcrmTest);
      }
      else{
        yield co(eliminarInstancia);
        yield co(extraerArchivos);
        modificarArchivos();
        yield co(restaurarDB);
        yield co(obtenerVersion);
        yield co(sugarcrmInstalandoDependencias);
        yield co(sugarcrmRepair)
        yield co(sugarcrmTest)
      }
      message = "Finalizando restore "+instance+".merxbp.loc";
      spinner = ora(message).start();
      spinner.succeed(message);
      spinner.stop();
    }
  });

})
.parse(process.argv);

function *eliminarInstancia() {
  message = "Eliminando instancia obsoleta "+instance_name+".merxbp.loc";
  promise = promiseFromChildProcess(
    child_process.spawn('rm -rf '+instance_dir, {
      shell: true
    })
  );
  ora.promise(promise, {text:message});
  yield promise;
}

function *extraerArchivos() {
  message = "Extrayendo restore files";
  spinner.text = message;

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
         yield promiseFromChildProcess(
           child_process.spawn('pv '+files[0]+' | tar xzf - -C . ', {
             cwd: metadata.backup_dir,
             stdio: 'inherit',
             shell: true
           })
         );
       }
    } catch (err) {
      console.error(`chdir: ${err}`);
    }
    spinner = ora(message).start();
  }
  else{
    yield shell.exec("tar -zxvf "+ tar_dir + ".tar.gz");
  }
  spinner.succeed(message);

  message = "Moviendo carpeta de la instancia";
  spinner.text = message;
  shell.cd(tar_dir);
  shell.exec("mv sugar" + metadata.sugar_version+metadata.sugar_flavor + " " + instance_dir);
  shell.exec("mv sugar" + metadata.sugar_version+metadata.sugar_flavor + ".sql " + instance_dir);
  spinner.succeed(message);
}

function modificarArchivos() {
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

}

function *restaurarDB() {
  shell.cd(instance_dir);
  var vagrant_ssh_mysql = "vagrant ssh -c 'mysql -u root -proot ";

  message = "Eliminando bases de datos obsoleta origin";
  promise = promiseFromChildProcess(
    child_process.spawn(vagrant_ssh_mysql + '-e "DROP DATABASE '+instance_name+'_origin"' + "'", {
      shell: true
    })
  );
  ora.promise(promise, {text:message});
  yield promise;

  message = "Eliminando bases de datos obsoleta de pruebas";
  promise = promiseFromChildProcess(
    child_process.spawn(vagrant_ssh_mysql + '-e "DROP DATABASE '+instance_name+'"' + "'", {
      shell: true
    })
  );
  ora.promise(promise, {text:message});
  yield promise;

  message = "Creando bases de datos nueva origin";
  promise = promiseFromChildProcess(
    child_process.spawn(vagrant_ssh_mysql + '-e "CREATE DATABASE '+instance_name+'_origin"' + "'", {
      shell: true
    })
  );
  ora.promise(promise, {text:message});
  yield promise;

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

  message = "Restaurando base de datos de origin";
  command = vagrant_ssh_mysql + instance_name +"_origin < /vagrant/"+instance_name+".merxbp.loc/sugar"+metadata.sugar_version+metadata.sugar_flavor+".sql'";
  promise = promiseFromChildProcess(
    child_process.spawn(command, {
      shell: true
    })
  );
  ora.promise(promise, {text:message});
  yield promise;

  if(metadata.dbconfig.db_scripts && metadata.dbconfig.db_scripts.length){
    message = "Ejecutando scripts para base de datos de pruebas";
    spinner.text = message;
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
}

function *obtenerVersion() {
  spinner.text = "Configurando version de desarrollo ...";

  yield co(fetchLocalDirFromRemote);

  shell.cd(instance_dir);

  if(program.gitOnly){
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
}

function promiseFromChildProcess(child) {
  return new Promise(function (resolve, reject) {
      child.addListener("error", reject);
      child.addListener("exit", resolve);
  });
}

function *fetchLocalDirFromRemote() {
  spinner.text = "Actualizando repositorio local";
  var branch_validate = child_process.spawn(' git branch --list | grep ' + metadata.branch, {
    cwd: nconf.get('github:local:dir'),
    shell: true
  });
  var output = "";
  branch_validate.stdout.on('data', function (data) {
    output = data.toString().trim().replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').replace('* ', '');
    console.log("output:", JSON.stringify(output));
  });
  var git_fetch_origin = yield promiseFromChildProcess(branch_validate);
  if(output && output === metadata.branch){
    console.log("si tiene el branch");
    command = 'git checkout ' + metadata.branch + '; git pull ' + nconf.get('github:local:remote') + ' ' + metadata.branch;
    console.log("command:" , command)
    var git_fetch_origin = yield promiseFromChildProcess(child_process.spawn(command, {
      cwd: nconf.get('github:local:dir'),
      shell: true,
      stdio: 'inherit'
    }));
  }
  else{
    console.log("no tiene el branch");
    command = 'git fetch ' + nconf.get('github:local:remote') + ' ' + metadata.branch + '; git checkout -b ' + metadata.branch + ' ' + nconf.get('github:local:remote') + '/' + metadata.branch;
    console.log("command:" , command)
    var git_fetch_origin = yield promiseFromChildProcess(child_process.spawn(command, {
      cwd: nconf.get('github:local:dir'),
      shell: true,
      stdio: 'inherit'
    }));
  }
  spinner.succeed("Repositorio local actualizado");
}

function *sugarcrmInstalandoDependencias() {
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
}

function *sugarcrmRepair() {
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
}

function *sugarcrmTest() {

  message = "Pruebas PHP";
  command = "vagrant ssh -c 'cd /vagrant/"+instance_name+".merxbp.loc/tests; ../vendor/phpunit/phpunit/phpunit'";
  promise = promiseFromChildProcess(
    child_process.spawn(command, {
      cwd: instance_dir,
      shell: true,
      stdio: 'inherit'
    })
  );
  ora.promise(promise, {text:message});
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
  ora.promise(promise, {text:message});
  yield promise;
}
