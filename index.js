var co = require('co');
var prompt = require('co-prompt');
var program = require('commander');
var shell = require('shelljs');
var nconf = require('nconf');
var child_process = require('child_process')
nconf.file({ file: "config.json" });

var metadata = null;
var instance_dir = null;
var instance_name = null;

program
.arguments('<instance>')
.action(function(instance) {
  co(function *() {
    // var instance = yield prompt('instance: ');
    console.log('instance: %s', instance);
    metadata = nconf.get('instances:'+instance);
    if(metadata){
      instance_name = instance;
      // console.log(metadata);
      instance_dir = nconf.get('vagrant:dir_base') + instance_name + ".merxbp.loc";

      console.log("Iniciando restore lowes.merxbp.loc ... ");
      // eliminarInstancia();
      // extraerArchivos();
      // modificarArchivos();
      // restaurarDB();
      obtenerVersion();
      // shell.ls('*.*').forEach(function (file) {
      //   console.log(file);
      // });
    }
  });
})
.parse(process.argv);

function eliminarInstancia() {
  console.log("Eliminando instancia obsoleta lowes.merxbp.loc ... ");
  shell.rm("-rf", instance_dir);
}

function extraerArchivos() {
  console.log("Extrayendo restore files ... ");
  shell.cd(metadata.backup_dir);
  var tar_dir = instance_name+".sugarondemand.com."+metadata.sugar_version+metadata.sugar_flavor+".*";
  shell.exec("tar -zxvf "+ tar_dir + ".tar.gz");

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
  console.log(instance_name);
  console.log(instance_dir);
  shell.ls('*.sql').forEach(function (file) {
    console.log(file);
  });
  var vagrant_ssh_mysql = "vagrant ssh -c 'mysql -u root -proot ";
  shell.exec(vagrant_ssh_mysql + '-e "DROP DATABASE '+instance_name+'_origin"' + "'");
  shell.exec(vagrant_ssh_mysql + '-e "CREATE DATABASE '+instance_name+'_origin"' + "'");
  shell.exec(vagrant_ssh_mysql + '-e "DROP DATABASE '+instance_name+'"' + "'");
  shell.exec(vagrant_ssh_mysql + '-e "CREATE DATABASE '+instance_name+'"' + "'");
  command = vagrant_ssh_mysql + instance_name +" < /vagrant/"+instance_name+".merxbp.loc/sugar"+metadata.sugar_version+metadata.sugar_flavor+".sql'";
  console.log("command:", command);
  shell.exec(command);
  command = vagrant_ssh_mysql + instance_name +"_origin < /vagrant/"+instance_name+".merxbp.loc/sugar"+metadata.sugar_version+metadata.sugar_flavor+".sql'";
  shell.exec(command);
  if(metadata.db_scripts && metadata.db_scripts.length){

  }
}

function obtenerVersion(callback) {
  console.log("Configurando version de desarrollo ...");
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
  shell.exec('git fetch origin');
  // shell.exec('git fetch merx');
  shell.exec('git checkout -b '+metadata.branch+' merx/'+metadata.branch);
}
