var co = require('co');
var prompt = require('co-prompt');
var program = require('commander');
var shell = require('shelljs');
var nconf = require('nconf');
nconf.file({ file: "config.json" });


program
.arguments('<instance>')
.action(function(instance) {
  co(function *() {
    // var instance = yield prompt('instance: ');
    console.log('instance: %s', instance);
    var metadata = nconf.get('instances:'+instance);
    if(metadata){
      // console.log(metadata);
      var instance_dir = nconf.get('vagrant:dir_base') + instance + ".merxbp.loc";

      console.log("Iniciando restore lowes.merxbp.loc ... ");

      console.log("Eliminando instancia obsoleta lowes.merxbp.loc ... ");
      shell.rm("-rf", instance_dir);

      console.log("Extrayendo restore files ... ");
      shell.cd(metadata.backup_dir);
      var tar_dir = instance+".sugarondemand.com."+metadata.sugar_version+metadata.sugar_flavor+".*";
      shell.exec("tar -zxvf "+ tar_dir + ".tar.gz");
      shell.cd(tar_dir);
      shell.exec("mv sugar" + metadata.sugar_version+metadata.sugar_flavor + " " + instance_dir);
      shell.exec("mv sugar" + metadata.sugar_version+metadata.sugar_flavor + ".sql " + instance_dir);

      console.log("Modificando archivos config.php ...");
      shell.cd(instance_dir);
      shell.sed("-i", metadata.dbconfig.db_host_name, "localhost", "config.php");
      shell.sed("-i", metadata.dbconfig.db_user_name, "root", "config.php");
      shell.sed("-i", metadata.dbconfig.db_password, "root", "config.php");
      shell.sed("-i", metadata.dbconfig.db_name, instance, "config.php");
      shell.sed("-i", instance+".sugarondemand.com", instance+".merxbp.loc", "config.php");
      shell.sed("-i", metadata.Elastic.host, "localhost", "config.php");
      shell.rm("-rf", "cache/*");

      console.log("Modificando archivos .htaccess ...");
      shell.sed("-i", "RewriteBase /", "RewriteBase /sugar/"+ instance+".merxbp.loc/", ".htaccess");

      console.log("Restaurando base de datos ...");
      var vagrant_ssh_mysql = "vagrant ssh -c 'mysql -u root -proot ";
      shell.exec(vagrant_ssh_mysql + '-e "DROP DATABASE '+instance+'_origin"' + "'");
      shell.exec(vagrant_ssh_mysql + '-e "CREATE DATABASE '+instance+'_origin"' + "'");
      shell.exec(vagrant_ssh_mysql + '-e "DROP DATABASE '+instance+'"' + "'");
      shell.exec(vagrant_ssh_mysql + '-e "CREATE DATABASE '+instance+'"' + "'");
      shell.exec(vagrant_ssh_mysql + instance +" < /vagrant/"+instance+".merxbp.loc/sugar"+metadata.sugar_version+metadata.sugar_flavor+".sql");
      shell.exec(vagrant_ssh_mysql + instance +"_origin < /vagrant/"+instance+".merxbp.loc/sugar"+metadata.sugar_version+metadata.sugar_flavor+".sql");

      // shell.ls('*.*').forEach(function (file) {
      //   console.log(file);
      // });
    }
  });
})
.parse(process.argv);
