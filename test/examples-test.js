/*
 Copyright 2017 Bitnami.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/

'use strict';

const exec = require('child_process').exec;
const expect = require('chai').expect;
const fs = require('fs-extra');
const helpers = require('../lib/helpers');
const moment = require('moment');
const path = require('path');
const request = require('request');

function deployExample(cwd, example, callback) {
  fs.copy(`${__dirname}/../examples/${example}`, `${cwd}/${example}`, (err) => {
    if (err) throw err;
    fs.remove(`${cwd}/${example}/node_modules`, rmErr => {
      if (rmErr) throw rmErr;
      fs.mkdir(`${cwd}/${example}/node_modules`, mkdirErr => {
        if (mkdirErr) throw mkdirErr;
        fs.symlink(
          `${__dirname}/..`,
          `${cwd}/${example}/node_modules/serverless-kubeless`,
          (linkErr) => {
            if (linkErr) throw linkErr;
            exec('serverless deploy', { cwd: `${cwd}/${example}` }, (deployErr, stdout) => {
              if (deployErr) {
                console.error(`ERROR: ${example} failed to be deployed:\n${stdout}\n${deployErr}`);
              }
              callback();
            });
          }
        );
      });
    });
  });
}
function removeExample(cwd, example, callback) {
  exec('serverless remove', { cwd: `${cwd}/${example}` }, (removeErr) => {
    if (removeErr) throw removeErr;
    fs.remove(cwd, (rmErr) => {
      if (rmErr) throw rmErr;
      callback();
    });
  });
}

function getURL(info, regexp) {
  let URL = info.match(regexp || /URL:\s+(.*)/)[1];
  if (URL.match('API_URL')) {
    URL = URL.replace(
      'API_URL',
      helpers.getKubernetesAPIURL(helpers.loadKubeConfig()).replace(/:[0-9]+$/, ''));
  }
  return URL;
}

function postWithRedirect(url, body, callback) {
  request.post({ url, body, strictSSL: false }, (err, res) => {
    if (res.statusCode === 301) {
      request.post({ url: res.headers.location, body, strictSSL: false }, (errR, resR) => {
        callback(errR, resR);
      });
    } else {
      callback(err, res);
    }
  });
}

describe('Examples', () => {
  let cwd = null;

  describe('event-trigger-python', function () {
    this.timeout(10000);
    before(function (done) {
      this.timeout(300000);
      cwd = path.join('/tmp', moment().valueOf().toString());
      fs.mkdirSync(cwd);
      deployExample(cwd, 'event-trigger-python', done);
    });
    after(function (done) {
      this.timeout(300000);
      removeExample(cwd, 'event-trigger-python', done);
    });
    it('should get a submmited message "hello world"', (done) => {
      exec('kubeless topic publish --topic hello_topic --data "hello world"', (err, stdout) => {
        if (err) {
          console.error(stdout);
          throw err;
        }
        exec(
          'serverless logs -f events',
          { cwd: `${cwd}/event-trigger-python` },
          (eerr, logs) => {
            if (eerr) throw eerr;
            expect(logs).to.contain('hello world');
            done();
          }
        );
      });
    });
  });
  describe('get-python', function () {
    this.timeout(10000);
    before(function (done) {
      this.timeout(300000);
      cwd = path.join('/tmp', moment().valueOf().toString());
      fs.mkdirSync(cwd);
      deployExample(cwd, 'get-python', done);
    });
    after(function (done) {
      this.timeout(300000);
      removeExample(cwd, 'get-python', done);
    });
    it('should return a "hello world"', (done) => {
      exec('serverless invoke -f hello -l', { cwd: `${cwd}/get-python` }, (err, stdout) => {
        if (err) throw err;
        expect(stdout).to.contain('hello world');
        done();
      });
    });
  });
  describe('get-ruby', function () {
    this.timeout(10000);
    before(function (done) {
      this.timeout(300000);
      cwd = path.join('/tmp', moment().valueOf().toString());
      fs.mkdirSync(cwd);
      deployExample(cwd, 'get-ruby', done);
    });
    after(function (done) {
      this.timeout(300000);
      done();
      removeExample(cwd, 'get-ruby', done);
    });
    it('should return the latest kubeless version', (done) => {
      exec('serverless invoke -f version -l', { cwd: `${cwd}/get-ruby` }, (err, stdout) => {
        if (err) throw err;
        expect(stdout).to.match(/[0-9]+\.[0-9]+\.[0-9]+/);
        done();
      });
    });
  });
  describe('http-custom-path', function () {
    this.timeout(10000);
    before(function (done) {
      this.timeout(300000);
      cwd = path.join('/tmp', moment().valueOf().toString());
      fs.mkdirSync(cwd);
      deployExample(cwd, 'http-custom-path', () => {
        setTimeout(done, 15000);
      });
    });
    after(function (done) {
      this.timeout(300000);
      removeExample(cwd, 'http-custom-path', done);
    });
    it('should return a "hello world" in a subpath', (done) => {
      exec('serverless info', { cwd: `${cwd}/http-custom-path` }, (err, stdout) => {
        if (err) throw err;
        const URL = getURL(stdout);
        expect(URL).to.match(/.*\/hello/);
        request.get({ url: URL, strictSSL: false }, (gerr, res) => {
          if (gerr) throw gerr;
          expect(res.body).to.contain('hello world');
          done();
        });
      });
    });
  });
  describe('multi-python', function () {
    this.timeout(10000);
    before(function (done) {
      this.timeout(300000);
      cwd = path.join('/tmp', moment().valueOf().toString());
      fs.mkdirSync(cwd);
      deployExample(cwd, 'multi-python', done);
    });
    after(function (done) {
      this.timeout(300000);
      removeExample(cwd, 'multi-python', done);
    });
    it('should return "foo"', (done) => {
      exec(
        'serverless invoke -f foo -l --data \'{"hello": "world"}\'',
        { cwd: `${cwd}/multi-python` },
        (err, stdout) => {
          if (err) throw err;
          expect(stdout).to.contain('foo');
          done();
        }
      );
    });
    it('should return "bar"', (done) => {
      exec(
        'serverless invoke -f bar -l --data \'{"hello": "world"}\'',
        { cwd: `${cwd}/multi-python` },
        (err, stdout) => {
          if (err) throw err;
          expect(stdout).to.contain('bar');
          done();
        }
      );
    });
  });
  describe('post-nodejs', function () {
    this.timeout(10000);
    before(function (done) {
      this.timeout(300000);
      cwd = path.join('/tmp', moment().valueOf().toString());
      fs.mkdirSync(cwd);
      deployExample(cwd, 'post-nodejs', done);
    });
    after(function (done) {
      this.timeout(300000);
      removeExample(cwd, 'post-nodejs', done);
    });
    it('should return "Hello world"', (done) => {
      exec(
        'serverless invoke -f capitalize --data "hello world" -l',
        { cwd: `${cwd}/post-nodejs` },
        (err, stdout) => {
          if (err) throw err;
          expect(stdout).to.contain('Hello world');
          done();
        }
      );
    });
  });
  describe('post-python', function () {
    this.timeout(10000);
    before(function (done) {
      this.timeout(300000);
      cwd = path.join('/tmp', moment().valueOf().toString());
      fs.mkdirSync(cwd);
      deployExample(cwd, 'post-python', done);
    });
    after(function (done) {
      this.timeout(300000);
      removeExample(cwd, 'post-python', done);
    });
    it('should return a the request', (done) => {
      exec(
        'serverless invoke -f echo --data \'{"hello": "world"}\' -l',
        { cwd: `${cwd}/post-python` },
        (err, stdout) => {
          if (err) throw err;
          expect(stdout).to.contain('{ hello: \'world\' }');
          done();
        }
      );
    });
  });
  describe('post-ruby', function () {
    this.timeout(10000);
    before(function (done) {
      this.timeout(300000);
      cwd = path.join('/tmp', moment().valueOf().toString());
      fs.mkdirSync(cwd);
      deployExample(cwd, 'post-ruby', done);
    });
    after(function (done) {
      this.timeout(300000);
      removeExample(cwd, 'post-ruby', done);
    });
    it('should play ping-pong"', (done) => {
      exec(
        'serverless invoke -f ping --data "ping" -l',
        { cwd: `${cwd}/post-ruby` },
        (err, stdout) => {
          if (err) throw err;
          expect(stdout).to.contain('pong');
          done();
        }
      );
    });
  });
  describe('todo-app', function () {
    this.timeout(10000);
    let info = '';
    let id = null;

    before(function (done) {
      this.timeout(300000);
      cwd = path.join('/tmp', moment().valueOf().toString());
      fs.mkdirSync(cwd);
      // We need to deploy a MongoDB for the todo-app example
      exec(
        'curl -sL https://raw.githubusercontent.com/bitnami/bitnami-docker-mongodb/3.4.7-r0/kubernetes.yml',
        (err, manifest) => {
          if (err) {
            console.error('ERROR: Unable to download mongodb manifest');
          } else {
            fs.writeFile(`${cwd}/mongodb.yaml`, manifest, (werr) => {
              if (werr) throw werr;
              exec(`kubectl create -f ${cwd}/mongodb.yaml`, (kerr) => {
                if (kerr) {
                  console.error(`ERROR: Unable to deploy the mongoDB manifest: ${kerr.message}`);
                }
                const wait = setInterval(() => {
                  exec('kubectl get pods', (gerr, stdout) => {
                    if (gerr) throw gerr;
                    if (stdout.match(/mongodb-.*Running/)) {
                      clearInterval(wait);
                      deployExample(cwd, 'todo-app/backend', () => {
                        exec(
                          'serverless info',
                          { cwd: `${cwd}/todo-app/backend` },
                          (infoerr, output) => {
                            if (err) throw err;
                            info = output;
                            setTimeout(done, 15000);
                          }
                        );
                      });
                    }
                  });
                }, 2000);
              });
            });
          }
        }
      );
    });

    after(function (done) {
      this.timeout(300000);
      exec(`kubectl delete -f ${cwd}/mongodb.yaml`, (kerr) => {
        if (kerr) {
          console.error(`ERROR: Unable to remove the mongoDB manifest: ${kerr.message}`);
        }
        removeExample(cwd, 'todo-app/backend', done);
      });
      done();
    });
    it('should create a TODO', (done) => {
      const URL = getURL(info, /Service Information "create"\n(?:.*\n)*?URL:\s+(.*)/);
      expect(URL).to.match(/.*\/create/);
      postWithRedirect(URL, '{"body": "test"}', (err, res) => {
        if (err) throw err;
        const response = JSON.parse(res.body);
        expect(response).to.contain.keys(['body', 'id', 'updatedAt']);
        expect(response.body).to.be.eql('test');
        id = response.id;
        done();
      });
    });
    it('should read all the TODOs', (done) => {
      const URL = getURL(info, /Service Information "read-all"\n(?:.*\n)*?URL:\s+(.*)/);
      expect(URL).to.match(/.*\/read-all/);
      request.get({ url: URL, strictSSL: false }, (err, res) => {
        if (err) throw err;
        const response = JSON.parse(res.body);
        expect(response).to.be.an('array').with.length(1);
        expect(response[0]).to.contain.keys(['body', 'id', 'updatedAt']);
        expect(response[0].body).to.be.eql('test');
        done();
      });
    });
    it('should read one TODO', (done) => {
      const URL = getURL(info, /Service Information "read-one"\n(?:.*\n)*?URL:\s+(.*)/m);
      expect(URL).to.match(/.*\/read/);
      request.get({ url: `${URL}?id=${id}`, strictSSL: false }, (err, res) => {
        if (err) throw err;
        const response = JSON.parse(res.body);
        expect(response).to.contain.keys(['body', 'id', 'updatedAt']);
        expect(response.body).to.be.eql('test');
        done();
      });
    });
    it('should update one TODO', (done) => {
      const URL = getURL(info, /Service Information "update"\n(?:.*\n)*?URL:\s+(.*)/m);
      expect(URL).to.match(/.*\/update/);
      postWithRedirect(`${URL}?id=${id}`, '{"body": "new-test"}', (err, res) => {
        if (err) throw err;
        const response = JSON.parse(res.body);
        expect(response).to.contain.keys(['body', 'id', 'updatedAt']);
        expect(response.body).to.be.eql('new-test');
        id = response.id;
        done();
      });
    });
    it('should delete one TODO', (done) => {
      const URL = getURL(info, /Service Information "delete"\n(?:.*\n)*?URL:\s+(.*)/m);
      expect(URL).to.match(/.*\/delete/);
      request.get({ url: `${URL}?id=${id}`, strictSSL: false }, (err, res) => {
        if (err) throw err;
        const response = JSON.parse(res.body);
        expect(response).to.contain.keys(['body', 'id', 'updatedAt']);
        expect(response.body).to.be.eql('new-test');
        done();
      });
    });
  });
});