const http=require('node:http'),assert=require('node:assert/strict');
const base=new URL(process.env.ONES_TEST_URL||'');
if(base.hostname!=='127.0.0.1'||process.env.ONES_DISPOSABLE_TEST!=='1')throw Error('Disposable loopback required');
function request(path,method='GET'){return new Promise((resolve,reject)=>{
 const req=http.request({hostname:base.hostname,port:base.port,path,method},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();
});}
(async()=>{
 let checks=0;
 const privatePaths=['/ones-deployment-ready.zip','/UPPER.ZIP','/archive.7z','/backup.tar.gz','/ones-sqlite-restore-backup.json','/database.sqlite','/database.sqlite-wal','/database.sqlite-shm','/database.sqlite.migration.lock','/database.db','/database.db-journal','/php-server.err.log','/config.local.php','/config.example.php','/config.php','/README.md','/DEPLOYMENT.md','/web.config','/_config.yml','/.env','/.env.production','/.git/config','/.runtime/private.txt','/.agents/AGENTS.md','/tests/private.txt','/deploy/private.txt','/deployment-old/index.html','/deployment-package-test/api.php','/tmp-upload-check/index.html','/vendor/phpmailer/src/SMTP.php','/migrate.php','/schema-migrations.php','/record-pages.php','/scooter-hero-concept.html','/scooter-theme-hero-preview.html','/admin.css.bak','/unknown.php','/uploads/test.php','/uploads/test.PHP.jpg','/uploads/test.phtml.png','/assets/test.php.jpg','/assets/private.json','/assets/.private.css','/assets/vendor/DOMPurify-LICENSE'];
 for(const method of ['GET','HEAD','POST'])for(const path of privatePaths){
  const r=await request(path,method);assert.ok([403,404].includes(r.status),`${method} ${path}: ${r.status}`);checks++;
 }
 for(const path of ['/config%2elocal.php','/%2eenv','/deployment%2dold/index.html','/data%2fones.sqlite','/data%252fones.sqlite','/%252eenv','/assets/../config.local.php','/assets/%2e%2e/config.local.php','/uploads/test.php%2ejpg','/api.php/private.css','/admin.css/extra','/uploads/test.php.jpg/extra','/assets%5c..%5cconfig.local.php']){
  const r=await request(path);assert.ok([400,403,404].includes(r.status),`${path}: ${r.status}`);checks++;
 }
 for(const path of ['/','/index.html','/admin.html','/login.html','/profile.html','/cart.html','/blog.html','/product.html','/privacy.html','/terms.html','/verify.html','/styles.css?v=test','/admin.css?v=test','/api-client.js','/profile-orders.js','/assets/ones-logo.webp','/assets/vendor/purify-3.4.16.min.js','/uploads/test.pdf','/uploads/test.png','/.well-known/acme-challenge/test-token','/api.php?action=cms','/sitemap.php']){
  const r=await request(path);assert.equal(r.status,200,path);checks++;
  if(/\.css\?/.test(path)&&base.port==='18865'){assert.match(r.headers['cache-control'],/max-age=2592000/);checks++;}
 }
 for(const path of ['/admin.html','/login.html','/profile.html','/cart.html','/verify.html','/api.php?action=cms']){
  const r=await request(path);if(base.port==='18865'||path.startsWith('/api.php')){assert.match(r.headers['cache-control'],/no-store/);checks++;}
 }
 console.log(`Public paths: ${checks} checks at ${base.origin} (real files, three methods, encodings, public media, ACME, PHP and cache headers)`);
})().catch(e=>{console.error(e);process.exitCode=1;});
