$(document).ready(function() {
  /*VARIABLES*/
  let texturePack = {
    name: 'Classic',
    tiles: 'resources/textures/tiles.png',
    portal: 'resources/textures/portal.png',
    speedpad: 'resources/textures/speedpad.png',
    speedpadRed: 'resources/textures/speedpadred.png',
    speedpadBlue: 'resources/textures/speedpadblue.png',
    splats: 'resources/textures/splats.png',
    gravityWell: 'https://static.koalabeast.com/images/gravitywell.png',//'resources/textures/gravitywell.png',
    flair: 'https://static.koalabeast.com/images/flair.png',//'resources/textures/flair.png'
  },
  tempTexturePack = $.extend({},texturePack),
  settings = {
    webm: false,
    batch: false,
    batchVal: 10,
    zip: true,
    spin: false,
    splats: false,
    ui: true,
    chat: true,
  },
  frameWindow = document.getElementById('textureframe').contentWindow,
  toRender = [],
  renderer,
  recorder = {},
  chunks = [],
  currentFrame = -1,
  currentMaxFrames = -1,
  currentFpsDelay = -1,
  currentIndex = 0,
  batchIndex = 0,
  completed = 0,
  rendering = false,
  paused = false,
  inactive = true;
  
  let temp = $.parseJSON(sessionStorage.getItem('settings') || '{}');
  if(!$.isEmptyObject(temp)) {
    settings = $.extend({},temp);
    $('.setting').each(function(i,elem) {
      elem.checked = settings[elem.value];
    });
    if($('#downloadeach').prop('checked')) $('#downloadzip').prop('disabled', false);
  }
  temp = $.parseJSON(sessionStorage.getItem('texturepack') || '{}');
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
  zip.workerScriptsPath = 'resources/zip/';
  function downloadFile(url,filename,extension) {
    console.log(url);
    let a = document.createElement('a');
    document.body.appendChild(a);
    a.href = url;
    a.download = filename+'.'+extension;
    a.click();
    window.URL.revokeObjectURL(url);
    a.parentNode.removeChild(a);
  }
  
  function getBlob(index,callback) {
    let $slide = slicker.$slides.eq(index);
    if(!$slide.hasClass('complete')) callback(false);
    let filename = $slide.find('p').text();
    filename = filename.substring(0,filename.lastIndexOf('.'))+'.webm';
    let url = $.data($slide,'webm');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'blob';
    xhr.onload = function(e) {
      if(this.status == 200) {
        callback(true,filename,this.response);
      }
    };
    xhr.send();
  }
  
  function downloadZip(all,zipWriter) {
    if(all) {
      zip.createWriter(new zip.BlobWriter(), function(writer) {
        function nextFile(i) {
          if(i<slicker.slideCount) {
            getBlob(i,function(goodfile,filename,blob) {
              if(goodfile) {
                writer.add(filename, new zip.BlobReader(blob), function() {
                  nextFile(++i);
                });
              } else {
                nextFile(++i);
              }
            });
          } else {
            writer.close(function(blob) { //blob contains the zip file as a Blob object
              downloadFile(URL.createObjectURL(blob),'replays_'+completed,'zip');
            });
          }
        }
        nextFile(0);
      });
    } else {
      zip.createWriter(new zip.BlobWriter(), function(writer) {
        let finished = 0;
        
        function nextFile(i) {
          if(i<slicker.slideCount && finished<settings.batchVal) {
            getBlob(i,function(goodfile,filename,blob) {
              if(goodfile) { //has 'complete' class
                writer.add(filename, new zip.BlobReader(blob), function() {
                  finished++;
                  nextFile(++i);
                });
              } else {
                nextFile(++i);
              }
            });
          } else {
            writer.close(function(blob) { //blob contains the zip file as a Blob object
              downloadFile(URL.createObjectURL(blob),'replays_'+(batchIndex+1)+'_to_'+(i+1),'zip');
            });
          }
        }
        nextFile(batchIndex);
      });
    }
  }
  /*END DOWNLOAD STUFF*/
  
  /*RENDERING STUFF*/
  function renderReplay(frame=0,frames,fpsDelay) {
    if(!paused && !inactive) {
      if(frame<frames) {
        currentFrame = frame;
        //logger.log(`Rendering frame ${frame} of ${frames}`);
        renderer.draw(frame);
        recorder.resume();
        setTimeout(function(frame,frames) {
          //recorder.requestData();
          recorder.pause();
          
          if(((frame+1)%(frames/50))<1) { //%every ~2%
            let frac = (frame+1)/frames*100;
            $('.progress-bar').css('width', frac+'%').attr('aria-valuenow', frac);
          }
          
          window.requestAnimationFrame(renderReplay.bind(this,++frame,frames,fpsDelay));
        },fpsDelay,frame,frames);
      } else {
        $('.progress-bar').css('width', '100%').attr('aria-valuenow', 100);
        recorder.stop();
        currentFrame = -1;
      }
    }
  }
  
  function beginRendering(currentIndex) {
    if(currentIndex<toRender.length) {
      slicker.goTo(currentIndex);
      slicker.$slides.eq(currentIndex-1).removeClass('current');
      if($.isEmptyObject(toRender[currentIndex])) { //bad file upload
        console.log('Bad file, moving on from:',currentIndex);
        beginRendering(++currentIndex);
      }
      rendering = true;
      inactive = false;
      chunks = [];
      console.log('Started rendering:',currentIndex);
      slicker.$slides.eq(currentIndex).addClass('current');
      renderer = new Renderer($('#game')[0],toRender[currentIndex],settings);
      renderer.ready().then((function(toRender,currentIndex){
        recorder = new MediaRecorder($('#game')[0].captureStream(), {mimeType: 'video/webm'});
        recorder.ondataavailable = function(event) {
          if(event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        }
        recorder.onstop = function() {
          console.log('Finished rendering:',currentIndex,'at:',frame,chunks.length);
          window.chunky = chunks;
          let blob = new Blob(chunks, {type: 'video/webm'});
          let url = URL.createObjectURL(blob);
          let $slide = slicker.$slides.eq(currentIndex);
          $.data($slide,'webm',url);
          $slide.addClass('complete');
          
          completed++;
          if(settings.webm) {
            let filename = $slide.find('p').text();
            filename = filename.substring(0,filename.lastIndexOf('.'));
            downloadFile(url,filename,'webm');
          }
          if(settings.batch && !(completed%settings.batchVal)) {
            downloadZip();
            batchIndex = currentIndex+1;
          }
          
          if(!inactive) {
            beginRendering(++currentIndex);
          }
        }
        $('.progress-bar').css('width', '0%').attr('aria-valuenow', 0);
        recorder.start();
        recorder.pause();
        
        let replay = toRender[currentIndex],
          me = Object.keys(replay).find(k => replay[k].me == 'me'),
          fps = replay[me].fps; //+1 because setTimeout seems a little slow
        currentFrame = 0;
        currentMaxFrames = replay.clock.length;
        currentFpsDelay = 1000/fps;
        window.requestAnimationFrame(renderReplay.bind(this,currentFrame,currentMaxFrames,currentFpsDelay));
      }).bind(this,toRender,currentIndex));
    } else {
      if(settings.batch && completed%settings.batchVal) { //only if last replay wasn't on batch schedule
        downloadZip();
        batchIndex = currentIndex;
      }
      if(settings.zip) {
        downloadZip(true);
      }
      rendering = false;
      inactive = true;
      $('#render').addClass('btn-success').removeClass('btn-primary').text('Render');
      $('#stop').addClass('disabled');
      console.log('No more replays to render');
    }
  }
  
  function pauseRendering() {
    if(recorder.state==='recording') {
      //recorder.pause();
      $('#render').text('Resume');
      rendering = false;
      paused = true;
    }
  }
  
  function resumeRendering() {
    if(recorder.state==='paused') {
      $('#render').text('Pause');
      rendering = true;
      paused = false;
      //recorder.resume();
      window.requestAnimationFrame(renderReplay.bind(this,++currentFrame,currentMaxFrames,currentFpsDelay));
    }
  }
  
  $('#render').click(function(e) {
    if(rendering) {
      pauseRendering();
    } else if(paused) {
      resumeRendering();
    } else if(inactive) {
      //currentIndex = slicker.currentSlide;
      beginRendering(currentIndex);
      $('#render').addClass('btn-primary').removeClass('btn-success').text('Pause');
      $('#stop').removeClass('disabled');
    }
  });
  $('#stop').click(function(e) {
    if(rendering || paused) {
      rendering = false;
      inactive = true;
      recorder.stop();
      $('#game')[0].getContext('2d').clearRect(0,0,1280,800);
      $('#render').addClass('btn-success').removeClass('btn-primary').text('Render');
      $('#stop').addClass('disabled');
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
    if(what==='./textures') {
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
    } else if(what==='./logger') return (function() {
      return console;
    });
    else if(what==='image-promise') {
      return window.loadI;
    }
    else if(what==='moment') return window.moment;
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
      $('#carousel').slick('slickAdd','<div class="filename-outer'+flag+'">'+
      '<div class="wrapper">'+
      '<p class="filename-inner center-text">'+jsons[i][0]+'</p>'+
      '</div></div>');
    }
    if(anyGood) $('#render').removeClass('disabled');
    updateSlideCounter(false,slicker,slicker.currentSlide);
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
    window.files = e.originalEvent.dataTransfer.files;
    let reader = new FileReader();
    let jsons = [];
    let current = 0;
    function loadFile(files,i) {
      if(i<files.length) {
        reader.onload = (function(file) {
          return function(e) {
            let json = {};
            try {
              json = $.parseJSON(e.target.result || '{}');
            } catch(e) {
            }
            jsons.push([file.name,json]);
            loadFile(files,++i);
          }
        })(files[i]);
        try {
          reader.readAsText(files[i]);
        } catch(e) {
          jsons.push([files[i].name,{}]);
          loadFile(files,++i);
        }
      } else {
        $('#filedrag').hide().css('background-color','rgba(100,100,100,0.75)');
        $('#filedrag b').css('color','black').text('Drop Replay Files Here');
        dropComplete(jsons);
      }
    }
    loadFile(files,0)
  });
  /*END FILEHANDLING STUFF*/
  
  /*SETTINGS AND TEXTURE PICKING STUFF*/
  $('#save').click(function() {
    $('#options').addClass('ignore-hide').modal('hide');
    $('.setting').each(function(i,elem) {
      settings[elem.value] = elem.checked;
    });
    $('#batchval').val(~~$('#batchval').val()); //similar to Math.floor --> floats to integers and any text to 0
    if($('#batchval').val()<0) $('#batchval').val(0); //can manually type negatives and bypass min=0
    settings.batchVal = $('#batchval').val();
    texturePack = $.extend({},tempTexturePack);
    $('#tname').text('Current Texture Pack: '+texturePack.name);
    sessionStorage.setItem('settings',JSON.stringify(settings));
    sessionStorage.setItem('texturepack',JSON.stringify(texturePack));
  });
  $('#options').on('hidden.bs.modal',function() {
    if(!$(this).hasClass('ignore-hide')) {
      $('.setting').each(function(i,elem) {
        elem.checked = settings[elem.value];
      });
      $('#batchval').val(settings.batchVal);
      $('#tname').text('Current Texture Pack: '+texturePack.name);
      frameWindow.$(".texture-choice").removeClass("active-pack");
      frameWindow.$(".texture-choice[data-name='"+texturePack.name+"']").addClass("active-pack");
      if(!$('#downloadeach').prop('checked') && !$('#downloadbatch').prop('checked')) $('#downloadzip').prop({'checked': true, 'disabled': true});
    }
    $(this).removeClass('ignore-hide');
  });
  
  $('#downloadeach').change(function() {
    if($(this).prop('checked')) {
      $('#downloadzip').prop('disabled',false);
    } else if(!$('#downloadbatch').prop('checked')) {
      $('#downloadzip').prop({'checked': true, 'disabled': true});
    }
  });
  
  $('#downloadbatch').change(function() {
    if($(this).prop('checked')) {
      $('#downloadzip').prop('disabled',false);
    } else if(!$('#downloadeach').prop('checked')) {
      $('#downloadzip').prop({'checked': true, 'disabled': true});
    }
  })
  
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