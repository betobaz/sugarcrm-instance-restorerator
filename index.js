var co = require('co');
var prompt = require('co-prompt');
var program = require('commander');
var shell = require('shelljs');
var nconf = require('nconf');
var spawn = require('co-child-process');
var child_process = require('child_process');
var Promise = require('bluebird');
var fs = require('fs');

nconf.file({ file: "config.json" });

var metadata = null;
var instance_dir = null;
var instance_name = null;

program
.arguments('<instance>')
.action(function(instance) {
  co(function *() {
    // var instance = yield prompt('instance: ');
    // console.log('instance: %s', instance);
    metadata = nconf.get('instances:'+instance);
    if(metadata){
      instance_name = instance;
      // console.log(metadata);
      instance_dir = nconf.get('vagrant:dir_base') + instance_name + ".merxbp.loc";

      console.log("Iniciando restore lowes.merxbp.loc ... ");
      // eliminarInstancia();
      // yield co(extraerArchivos);
      // modificarArchivos();
      restaurarDB();
      // yield co(obtenerVersion);
      // shell.ls('*.*').forEach(function (file) {
      //   console.log(file);
      // });
    }
  });

  // if(instance_name){
  //   co(obtenerVersion);
  // }
  // obtenerVersion();
})
.parse(process.argv);

function eliminarInstancia() {
  console.log("Eliminando instancia obsoleta lowes.merxbp.loc ... ");
  shell.rm("-rf", instance_dir);
}

function *extraerArchivos() {
  console.log("Extrayendo restore files ... ");
  shell.cd(metadata.backup_dir);
  var tar_dir = instance_name+".sugarondemand.com."+metadata.sugar_version+metadata.sugar_flavor+".*";
  pv = shell.which('pv');
  if (pv) {
    // console.log("Entrar para pv");
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
  }
  else{
    yield shell.exec("tar -zxvf "+ tar_dir + ".tar.gz");
  }
  console.log("Moviendo carpeta de la isntancia");
  shell.cd(tar_dir);
  shell.exec("mv sugar" + metadata.sugar_version+metadata.sugar_flavor + " " + instance_dir);
  shell.exec("mv sugar" + metadata.sugar_version+metadata.sugar_flavor + ".sql " + instance_dir);
}

function modificarArchivos() {
  console.log("Modificando archivos config.php ...");
  shell.cd(instance_dir);
  shell.sed("-i", metadata.dbconfig.db_host_name, "localhost", "config.php");
  shell.sed("-i", metadata.dbconfig.db_user_name, "root", "config.php");
  shell.sed("-i", metadata.dbconfig.db_password, "root", "config.php");
  shell.sed("-i", metadata.dbconfig.db_name, instance_name, "config.php");
  shell.sed("-i", instance_name+".sugarondemand.com", instance_name+".merxbp.loc", "config.php");
  shell.sed("-i", metadata.Elastic.host, "localhost", "config.php");
  shell.rm("-rf", "cache/*");

  console.log("Modificando archivos .htaccess ...");
  shell.sed("-i", "RewriteBase /", "RewriteBase /sugar/"+ instance_name+".merxbp.loc/", ".htaccess");
}

function restaurarDB() {
  console.log("Restaurando base de datos ...");
  shell.cd(instance_dir);
  var vagrant_ssh_mysql = "vagrant ssh -c 'mysql -u root -proot ";

  console.log("Eliminando bases de datos obsoletas ...");
  shell.exec(vagrant_ssh_mysql + '-e "DROP DATABASE '+instance_name+'_origin"' + "'",{silent:true});
  shell.exec(vagrant_ssh_mysql + '-e "DROP DATABASE '+instance_name+'"' + "'",{silent:true});
  shell.exec(vagrant_ssh_mysql + '-e "CREATE DATABASE '+instance_name+'_origin"' + "'",{silent:true});
  shell.exec(vagrant_ssh_mysql + '-e "CREATE DATABASE '+instance_name+'"' + "'",{silent:true});

  console.log("Restaurando base de datos de pruebas...");
  command = vagrant_ssh_mysql + instance_name +" < /vagrant/"+instance_name+".merxbp.loc/sugar"+metadata.sugar_version+metadata.sugar_flavor+".sql'";
  shell.exec(command,{silent:true});

  console.log("Restaurando base de datos de origin...");
  command = vagrant_ssh_mysql + instance_name +"_origin < /vagrant/"+instance_name+".merxbp.loc/sugar"+metadata.sugar_version+metadata.sugar_flavor+".sql'";
  shell.exec(command,{silent:true});

  if(metadata.dbconfig.db_scripts && metadata.dbconfig.db_scripts.length){
    console.log("Ejecutando scripts para base de datos de pruebas...");
    scripts_file = instance_name + '_scripts.sql';
    scripts_file_path = instance_dir +'/'+ scripts_file;
    console.log(scripts_file_path);
    shell.rm("-rf", scripts_file_path);
    var scripts_sql = fs.createWriteStream(scripts_file_path, {
      flags: 'a' // 'a' means appending (old data will be preserved)
    })
    metadata.dbconfig.db_scripts.forEach(function(script) {
      scripts_sql.write(script);
    });
    command = vagrant_ssh_mysql + instance_name +" < /vagrant/"+instance_name+".merxbp.loc/"+scripts_file+"'";
    console.log(command)
    shell.exec(command,{silent:true});
    scripts_sql.end();
  }
}

function *obtenerVersion() {
  console.log("Configurando version de desarrollo ...");
  console.log("instance_dir:", instance_dir);
  shell.cd(instance_dir);
  console.log("Configurando primer commit ...");
  shell.exec('touch .gitignore');
  shell.exec('git init');
  shell.exec('git add .gitignore');
  shell.exec('git commit -m "Primer commit"');
  shell.exec('echo "*" > .gitignore');
  shell.exec('git add .gitignore');
  shell.exec('git commit -m "Omitiendo archivos"');

  console.log("Configurando repositorios remotos ...");
  shell.exec('git remote add origin git@github.com:'+nconf.get('github:user')+'/custom_sugarcrm.git');
  shell.exec('git remote add merx git@github.com:MerxBusinessPerformance/custom_sugarcrm.git');

  console.log("Obteniendo cambios desde el repositorio remoto");
  var git_fetch_origin = yield child_process.spawn('git', ['fetch', 'origin'], {
    cwd: instance_dir,
    stdio: 'inherit'
  });

  var git_fetch_merx = yield child_process.spawn('git', ['fetch', 'merx'], {
    cwd: instance_dir,
    stdio: 'inherit'
  });
  shell.exec('git checkout -b '+metadata.branch+' merx/'+metadata.branch);
}

function promiseFromChildProcess(child) {
  return new Promise(function (resolve, reject) {
      child.addListener("error", reject);
      child.addListener("exit", resolve);
  });
}
