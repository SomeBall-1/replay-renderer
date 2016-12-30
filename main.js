$(document).ready(function() {
  /*VARIABLES*/
  let texturePack = {
    name: 'Classic',
    tiles: 'resources/textures/tiles.png',
    portal: 'resources/textures/portal.png',
    speedpad: 'resources/textures/speedpad.png',
    speedpadRed: 'resources/textures/speedpadred.png',
    speedpadred: 'resources/textures/speedpadred.png',
    speedpadBlue: 'resources/textures/speedpadblue.png',
    speedpadblue: 'resources/textures/speedpadblue.png',
    splats: 'resources/textures/splats.png',
    gravityWell: 'resources/textures/gravitywell.png',
    flair: 'https://static.koalabeast.com/images/flair.png'
  },
  tempTexturePack = $.extend({},texturePack),
  settings = {
    webm: true,
    zip: false,
    spin: false,
    splats: false,
    ui: true,
    chat: true,
  },
  frameWindow = document.getElementById('textureframe').contentWindow,
  toRender = [],
  renderer,
  chunks = [],
  currentFrame = -1,
  currentMaxFrames = -1,
  currentFpsDelay = -1,
  renderStart,
  frameStart,
  frameTimeout,
  at = new AudioTimeout(),
  currentIndex = 0,
  rendering = false,
  paused = false,
  inactive = true,
  skipping = false,
  visible = true,
  recorder = new MediaRecorder($('#game')[0].captureStream(), {mimeType: 'video/webm'});
  recorder.ondataavailable = function(event) {
    if(event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  }
  recorder.onstop = function() {
    if(!inactive) {
      console.log('Finished rendering:',currentIndex,'in:',(performance.now()-renderStart)/1000,'s');
      window.chunky = chunks;
      let blob = new Blob(chunks, {type: 'video/webm'});
      let url = URL.createObjectURL(blob);
      let $slide = slicker.$slides.eq(currentIndex);
      checkValidURL(url).then(function(code) { //on success (resolve)
        $slide.data('webm',url);
        $slide.addClass('complete');
    
        if(settings.webm) {
          downloadFile(url,$slide.data('name'),'webm');
        }
      }, function(code) { //on error (reject)
        $slide.addClass('error');
      });
      delete toRender[currentIndex];
      currentIndex++;
      beginRendering();
    } else if(skipping) {
      console.log('Skipping replay:',currentIndex);
      skipping = false;
      currentIndex++;
      beginRendering();
    } else { //pressed stop
      console.log('Stopping rendering at:',currentIndex);
      endRendering(true);
    }
  }
  
  let temp = $.parseJSON(localStorage.getItem('settings') || '{}');
  if(!$.isEmptyObject(temp)) {
    settings = $.extend({},temp);
    $('.setting').each(function(i,elem) {
      elem.checked = settings[elem.value];
    });
  }
  temp = $.parseJSON(localStorage.getItem('texturepack') || '{}');
  if(!$.isEmptyObject(temp)) {
    texturePack = $.extend({},temp);
    $('#tname').text('Current Texture Pack: '+texturePack.name);
  }
  /*END VARIABLES*/
  
  /*CAROUSEL STUFF */
  $('#carousel').slick({
    centerMode: true,
    infinite: false,
    slidesToShow: 5
  });
  let slicker = $('#carousel').slick('getSlick');
  let updateSlideCounter = function(e,slick,current) {
    $('#counter').text((current+1)+' of '+slick.slideCount);
  }
  $('#carousel').on('afterChange',updateSlideCounter);
  /*END CAROUSEL STUFF*/
  
  /*DOWNLOAD STUFF*/
  function downloadFile(url,filename,extension,revoke) {
    let a = document.createElement('a');
    document.body.appendChild(a);
    a.href = url;
    a.download = filename+'.'+extension;
    a.click();
    setTimeout(function() {
      if(revoke) window.URL.revokeObjectURL(url);
      a.parentNode.removeChild(a);
    },100);
  }
  
  function checkValidURL(url) {
    return new Promise(function(resolve,reject) {
      let xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.onload = function(e) {
        if(this.status === 200) {
          resolve(this.status);
        } else {
          reject(this.status); //404 is the issue
        }
      };
      xhr.send();
    });
  }
  
  function getBlob(index,callback) {
    let $slide = slicker.$slides.eq(index);
    if(!$slide.hasClass('complete')) return callback(false);
    let filename = $slide.data('name');
    let url = $slide.data('webm');
    let xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onload = function(e) { //get Blob from objecturl
      if(this.status === 200) {
        return callback(true,filename,this.response);
      } else if(this.status === 404) {
        slicker.$slides.eq(index).removeClass('complete').addClass('error');
        console.log('error 404 (too many files?): %i of %i',index+1,slicker.slideCount,url);
        return callback(false);
      }
    };
    xhr.send();
  }
  
  function downloadZip(reenable) {
    let $alert = $('<div class="alert alert-info text-center navbar-fixed-top"><strong>Creating .zip file of all replays...</strong></div>');
    $('body').append($alert);
    $('#permanentzip').addClass('disabled');
    //adapted from jsfiddles at https://github.com/Stuk/jszip/issues/343
    let filenames = [];
    let zipper = new JSZip();
    function addFile(ind) {
      if(ind<slicker.slideCount) {
        getBlob(ind,function(goodfile,filename,blob) {
          if(goodfile) {
            let reader = new FileReader();
            reader.onload = function() {
              let rs = streamBrowserify.Readable();
              let done = false;
              rs._read = function() {
                let buffer = done?null:(new Buffer(new Uint8Array(reader.result)));
                rs.push(buffer); //null sends EOF to stop reading (otherwise it loops)
                done = true;
              }
                        
              let temp = filename,
              ext = '.webm',
              count = 1;
              while(filenames.indexOf(temp)>-1) {
                temp = filename+'_'+(count++);
              }
              filename = temp;
              filenames.push(filename);
                        
              zipper.file(filename+ext,rs);
              addFile(++ind);
            }
            reader.readAsArrayBuffer(blob)
          } else {
            addFile(++ind);
          }
        });
      } else {
        if(!filenames.length) {
          $alert.remove();
          let $danger = $('<div class="alert alert-danger text-center navbar-fixed-top"><strong>Error creating .zip: No replays to save</strong></div>');
          setTimeout(function($danger) {
            $alert.remove();
          },3000,$danger);
          return false;
        }
        let writeStream = streamSaver.createWriteStream(filenames.length+(filenames.length===1?'_replay':'_replays')+'.zip').getWriter();
        return zipper.generateInternalStream({type: 'uint8array', streamFiles: true})
        .on('data', data => writeStream.write(data))
        .on('error', err => console.error(err))
        .on('end', function() {
          writeStream.close();
          $alert.remove();
          if(reenable) $('#render').removeClass('disabled');
          $('#permanentzip').removeClass('disabled');
        }).resume();
      }
    }
    addFile(0);
  }
  
  $('div.slick-track').on('click','.complete',function() {
    downloadFile($(this).data('webm'),$(this).data('name'),'webm');
  });

  $('#permanentzip').click(function() {
    if(!$(this).data('zip')) {
      downloadZip(!$('#render').hasClass('disabled'));
      $('#render').addClass('disabled');
    } else {
      downloadFile($(this).data('zip'),$(this).data('name'),'zip');
    }
  });
  /*END DOWNLOAD STUFF*/
  
  /*RENDERING STUFF*/
  function nextFrame() {
    if(recorder.state==='recording') { //hasn't been stopped in the time between
      //recorder.requestData();
      recorder.pause();
      if(((currentFrame+1)%(currentMaxFrames/50))<1) { //every ~2% = /50
        let frac = (currentFrame+1)/currentMaxFrames*100;
        $('.progress-bar').css('width', frac+'%').attr('aria-valuenow', frac);
      }
      currentFrame++;
      if(visible) renderReplay();
    }
  }
  
  function renderReplay() {
    if(!paused && !inactive) {
      if(currentFrame<currentMaxFrames) {
        /*if(performance.now()-frameStart > 20) {
          console.log(performance.now()-frameStart);
        }*/
        renderer.draw(currentFrame);
        if(recorder.state!=='paused') return; //can happen if stopped or skipped at this point
        frameStart = performance.now();
        recorder.resume();
        frameTimeout = setTimeout(nextFrame,currentFpsDelay);
      } else {
        $('.progress-bar').css('width', '100%').attr('aria-valuenow', 100);
        if(recorder.state!=='inactive') recorder.stop();
      }
    }
  }
  
  window.addEventListener('visibilitychange',function(e) {
    if(rendering) {
      if(document.hidden) {
        clearTimeout(frameTimeout);
        visible = false;
        let toGo = currentFpsDelay-(e.timeStamp-frameStart)-3; //semi-random 3 since it has a slight delay
        if(toGo<0 || isNaN(toGo)) {
          nextFrame();
        } else {
          at.delay(nextFrame,toGo);
        }
      } else {
        visible = true;
        if(rendering) renderReplay();
      }
    }
  });
  
  function skipReplay(permanent) {
    if(permanent) {
      slicker.$slides.eq(currentIndex).addClass('error');
      toRender[currentIndex] = {};
    }
    rendering = false;
    inactive = true;
    skipping = true;
    if(recorder.state!=='inactive') recorder.stop();
  }
  
  function endRendering(manual) {
    if(!manual) {
      if(settings.zip) {
        downloadZip();
      } else if($('div.filename-outer.complete').length) {
        $('#permanentzip').removeClass('disabled');
      }
    }
    slicker.$slides.eq(currentIndex).removeClass('current');
    rendering = false;
    inactive = true;
    $('#render').addClass('btn-success').addClass('disabled').removeClass('btn-primary').text('Render');
    $('#stop').addClass('disabled');
    $('#game')[0].getContext('2d').clearRect(0,0,1280,800);
    $('.progress-bar').css('width', '0%').attr('aria-valuenow', 0);
    console.log('No more replays to render');
  }
  
  function beginRendering() {
    $('#newCanvas').remove(); //leftover from renderer.js
    if(currentIndex<toRender.length) {
      if(slicker.currentSlide===currentIndex-1) slicker.goTo(currentIndex);
      slicker.$slides.eq(currentIndex-1).removeClass('current');
      if($.isEmptyObject(toRender[currentIndex])) { //bad file upload
        console.log('Bad file, moving on from:',currentIndex);
        currentIndex++;
        beginRendering();
      }
      rendering = true;
      inactive = false;
      chunks = [];
      renderStart = performance.now();
      console.log('Started rendering:',currentIndex);
      slicker.$slides.eq(currentIndex).addClass('current');
      renderer = new Renderer($('#game')[0],toRender[currentIndex],settings);
      renderer.ready().then(function(){
        $('.progress-bar').css('width', '0%').attr('aria-valuenow', 0);
        recorder.start();
        recorder.pause();
        
        let replay = toRender[currentIndex],
        me = Object.keys(replay).find(k => replay[k].me == 'me'),
        fps = replay[me].fps;
        currentFrame = 0;
        currentMaxFrames = replay.clock.length;
        currentFpsDelay = 1000/fps;
        if(visible) renderReplay();
      });
    } else {
      endRendering();
    }
  }
  
  function pauseRendering() {
    if(recorder.state==='recording') {
      $('#render').text('Resume');
      if($('div.filename-outer.complete').length) $('#permanentzip').removeClass('disabled');
      rendering = false;
      paused = true;
    }
  }
  
  function resumeRendering() {
    if(recorder.state==='paused') {
      $('#render').text('Pause');
      $('#permanentzip').addClass('disabled');
      rendering = true;
      paused = false;
      currentFrame++;
      if(visible) renderReplay();
    }
  }
  
  $('#render').click(function(e) {
    if(rendering) {
      pauseRendering();
    } else if(paused) {
      resumeRendering();
    } else if(inactive) {
      beginRendering(currentIndex);
      $('#render').addClass('btn-primary').removeClass('btn-success').text('Pause');
      $('#stop').removeClass('disabled');
      $('#permanentzip').addClass('disabled').removeData('zip').removeData('name');
    }
  });
  $('#stop').click(function(e) {
    if(rendering || paused) {
      rendering = false;
      inactive = true;
      if(recorder.state!=='inactive') recorder.stop();
      else endRendering(true); //should never go off
    }
  });
  /*END RENDERING STUFF*/
  
  /*HACKY STUFF*/
  $.ajaxPrefilter( function (options) { //thing to grab html around cors
    if (options.crossDomain && jQuery.support.cors) {
      var http = (window.location.protocol === 'http:' ? 'http:' : 'https:');
      options.url = http + '//cors-anywhere.herokuapp.com/' + options.url;
    }
  });
  
  //for tricking the renderer.js into working
  window.module = {};
  window.require = function(what) {
    if(what.match(/textures$/)) {
      return {get: function() {
        let urls = [];
        for (let name in texturePack) {
          if(name!=='name') urls.push(texturePack[name]);
        }
        return loadImage(urls).then(function(images) {
          let out = {};
          let keys = Object.keys(texturePack);
          let discount = 0;
          for (let i = 0; i < keys.length; i++) {
            if(keys[i]!=='name') out[keys[i]] = images[i-discount];
            else discount++;
          }
          return out;
        });
      }}
    } else if(what.match(/logger$/)) return (function() {
      let logger = $.extend({},console);
      logger.warning = logger.warn = function() {
        skipReplay(true);
        return console.warn.apply(this,arguments);
      }
      logger.error = function() {
        skipReplay(true);
        return console.error.apply(this,arguments);
      }
      return logger;
    });
    else if(what.match(/image-promise$/)) {
      return window.loadI;
    }
    else if(what.match(/moment$/)) {
      return window.moment;
    }
  }
  /*END HACKY STUFF*/
  
  /*FILE HANDLING STUFF*/
  function dropComplete(jsons) {
    let anyGood = false;
    for(let i = 0;i < jsons.length;i++) {
      let flag = '';
      toRender.push(jsons[i][1]);
      if($.isEmptyObject(jsons[i][1])) flag = ' error';
      else anyGood = true;
      let $slide = $('<div class="filename-outer'+flag+'">'+
      '<div class="wrapper">'+
      '<p class="filename-inner center-text">'+jsons[i][0]+'</p>'+
      '</div></div>');
      let filename = jsons[i][0].replace(/\.(txt|json)$/,'');
      $slide.data('name',filename);
      $('#carousel').slick('slickAdd',$slide[0]);
    }
    if(anyGood) $('#render').removeClass('disabled');
    updateSlideCounter(false,slicker,slicker.currentSlide);
  }
  
  let jsons = [];
  function handleFile(file,callback,i) {
    let reader = new FileReader();
    reader.onload = (function(file) {
      return function(e) {
        let json = {};
        try {
          json = $.parseJSON(e.target.result || '{}');
        } catch(e) {
        }
        jsons.push([file.name,json]);
        callback(i);
      }
    })(file);
    try {
      if(file.type!=='text/plain') {
        throw Error();
      }
      reader.readAsText(file);
    } catch(e) {
      jsons.push([file.name,{}]);
      callback(i);
    }
  }
  
  let mouseover = 0;
  $(document).on('dragenter',function(e) {
    e.preventDefault();
    mouseover++;
    $('#filedrag').show();
  }).on('dragleave',function(e) {
    e.preventDefault();
    mouseover--;
    if(mouseover<=0) {
      $('#filedrag').hide();
      mouseover = 0;
    }
  }).on('dragover drop',function(e) {
    e.preventDefault();
  });
  $('#filedrag').on('dragenter dragleave',function(e) {
    e.preventDefault();
  }).on('dragover',function(e) {
    e.preventDefault();
    e.originalEvent.dataTransfer.dropEffect = 'copy';
  }).on('drop',function(e) {
    mouseover = 10;
    e.stopPropagation();
    e.preventDefault();
    $('#filedrag').css('background-color','rgba(0,0,200,0.75)');
    $('#filedrag b').css('color','white').text('Uploading Replays...');
    let eventItems = e.originalEvent.dataTransfer.items,
    items = [];
    jsons = [];
    for(let i = 0;i < eventItems.length;i++) {
      items.push(eventItems[i].webkitGetAsEntry());
    }
    //adapted from: http://stackoverflow.com/a/11410455
    function traverseFileTree(item, path, callback, i) {
      path = path || "";
      if(item.isFile) {
        //Get file
        item.file(function(file) {
          handleFile(file,callback,i);
        });
      } else if(item.isDirectory) {
        //Get folder contents
        let dirReader = item.createReader();
        dirReader.readEntries(function loadDir(entries) {
          function insideLoadItems(index) {
            if(index<entries.length) {
              traverseFileTree(entries[index], path + item.name + "/", insideLoadItems, ++index);
            } else {
              callback(i);
            }
          }
          insideLoadItems(0);
        });
      }
    }
    function loadItems(index) {
      if(index<items.length) {
        let item = items[index]
        if(item) {
          traverseFileTree(item, '', loadItems, ++index);
        }
      } else {
        $('#filedrag').hide().css('background-color','rgba(100,100,100,0.75)');
        $('#filedrag b').css('color','black').text('Drop Replay Files Here');
        dropComplete(jsons);
      }
    }
    loadItems(0);
  });
  
  $('#uploader').on('change',function(event) {
    $('#filedrag').css('background-color','rgba(0,0,200,0.75)');
    $('#filedrag b').css('color','white').text('Uploading Replays...');
    $('#filedrag').show();
    jsons = [];
    let files = $('#uploader')[0].files;
    function traverse(index) {
      if(index<files.length) {
        handleFile(files[index],traverse,++index);
      } else {
        $('#filedrag').hide().css('background-color','rgba(100,100,100,0.75)');
        $('#filedrag b').css('color','black').text('Drop Replay Files Here');
        dropComplete(jsons);
      }
    }
    traverse(0);
  })
  /*END FILEHANDLING STUFF*/
  
  /*SETTINGS AND TEXTURE PICKING STUFF*/
  $('#save').click(function() {
    $('#options').addClass('ignore-hide').modal('hide');
    $('.setting').each(function(i,elem) {
      settings[elem.value] = elem.checked;
    });
    texturePack = $.extend({},tempTexturePack);
    $('#tname').text('Current Texture Pack: '+texturePack.name);
    localStorage.setItem('settings',JSON.stringify(settings));
    localStorage.setItem('texturepack',JSON.stringify(texturePack));
  });
  
  $('#options').on('hidden.bs.modal',function() {
    if(!$(this).hasClass('ignore-hide')) {
      $('.setting').each(function(i,elem) {
        elem.checked = settings[elem.value];
      });
      $('#tname').text('Current Texture Pack: '+texturePack.name);
      frameWindow.$(".texture-choice").removeClass("active-pack");
      frameWindow.$(".texture-choice[data-name='"+texturePack.name+"']").addClass("active-pack");
    }
    $(this).removeClass('ignore-hide');
  }).keypress(function(e) {
    if(e.keyCode===13) $('#save').click();
  });
  
  $('#texturemodal').on('hide.bs.modal',function() {
    $('#options').modal('show');
  });
  
  $.get('http://tagpro-radius.koalabeast.com/textures/',function(response) {
    let texturepage = response;
    texturepage = texturepage.replace(/(href|src)="\//g,'href="https://static.koalabeast.com/').replace(/http:\/\//g,'https://').replace(/id="logged-in">(.|\n|\r)*?<\/div>/,'id="logged-in">true</div>');
    texturepage = texturepage.replace('https://tagpro-radius.koalabeast.com/compact/global-texturePackPicker.js','./resources/global-texturePackPicker.js'); //until they support https
    frameWindow.document.open();
    frameWindow.document.write(texturepage);
    frameWindow.document.close();
    (function(send) { //intercept POSTs to prevent errors and to see when they select a new texture pack
      frameWindow.XMLHttpRequest.prototype.send = function(e) {
        for(let i = 0;i < arguments.length;i++) {
          if(typeof arguments[i]==="string" && arguments[i].match(/^name=/)) {
            let textures = window.decodeURIComponent(arguments[i]).replace(/\/textures/g,'https://static.koalabeast.com/textures');
            textures = textures.split('&');
            for(let i = 0;i < textures.length;i++) {
              let both = textures[i].split('=');
              if(both[0]==='name') tempTexturePack['name'] = both[1].replace(/\+/g,' ');
              else if(tempTexturePack[both[0]]) tempTexturePack[both[0]] = both[1];
            }
            if(tempTexturePack['name']==='custom') tempTexturePack['name'] = 'Custom';
            tempTexturePack.speedpadred = tempTexturePack.speedpadRed;
            tempTexturePack.speedpadblue = tempTexturePack.speedpadBlue;
            $('#texturemodal').modal('hide');
            $('#tname').text('Current Texture Pack: '+tempTexturePack.name);
            frameWindow.$(".texture-choice").removeClass("active-pack");
            frameWindow.$(".texture-choice[data-name='"+tempTexturePack.name+"']").addClass("active-pack");
          }
        }
      };
    })(frameWindow.XMLHttpRequest.prototype.send);
  });
  document.getElementById('textureframe').onload = function() {
    frameWindow.$('#header, .footer').remove();
    frameWindow.document.body.style.marginBottom = 0;
    frameWindow.$(".texture-choice[data-name='"+texturePack.name+"']").addClass("active-pack");
  }
  /*END SETTINGS AND TEXTURE PICKING STUFF*/
});