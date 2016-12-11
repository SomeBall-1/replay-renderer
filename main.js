$(document).ready(function() {
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
  $('#downloadeach').change(function() {
    if($(this).prop('checked')) {
      $('#downloadzip').prop('disabled',false);
    } else {
      $('#downloadzip').prop({'checked': true, 'disabled': true});
    }
  });
  /*END DOWNLOAD STUFF*/
  
  /*RENDERING STUFF*/
  let texturePack = {tiles: 'resources/textures/tiles.png',
  portal: 'resources/textures/portal.png',
  speedpad: 'resources/textures/speedpad.png',
  speedpadRed: 'resources/textures/speedpadred.png',
  speedpadBlue: 'resources/textures/speedpadblue.png',
  splats: 'resources/textures/splats.png',
  gravityWell: 'resources/textures/gravitywell.png',
  flair: 'resources/textures/flair.png'},
  toRender = [],
  renderer,
  recorder = {},
  chunks = [],
  currentFrame = -1,
  currentMaxFrames = -1,
  currentFpsDelay = -1,
  currentIndex = -1,
  rendering = false,
  paused = false,
  inactive = true;
  
  function renderReplay(frame=0,frames,fpsDelay) {
    if(!paused && !inactive) {
      if(frame<frames) {
        currentFrame = frame;
        //logger.log(`Rendering frame ${frame} of ${frames}`);
        renderer.draw(frame);
        if(((frame+1)%(frames/20))<1) { //%every ~5%
          let frac = (frame+1)/frames*100;
          $('.progress-bar').css('width', frac+'%').attr('aria-valuenow', frac);
        }
        
        return setTimeout(function(frame,frames,fpsDelay) {
          window.requestAnimationFrame(renderReplay.bind(this,frame,frames,fpsDelay));
        },fpsDelay,++frame,frames,fpsDelay);
      }
      $('.progress-bar').css('width', '100%').attr('aria-valuenow', 100);
      recorder.stop();
      currentFrame = -1;
    }
  }
  
  function beginRendering(currentIndex) {
    if(currentIndex<toRender.length) {
      rendering = true;
      inactive = false;
      chunks = [];
      console.log('Started rendering:',currentIndex);
      renderer = new Renderer($('#game')[0],toRender[currentIndex],{
        spin: $('#showspin').prop('checked'),
        splats: $('#showsplats').prop('checked'),
        ui: $('#showui').prop('checked'),
        chat: $('#showchat').prop('checked'),
      });
      renderer.ready().then((function(toRender,currentIndex){
        recorder = new MediaRecorder($('#game')[0].captureStream(), {mimeType: 'video/webm'});
        recorder.ondataavailable = function(event) {
          if(event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        }
        recorder.onstop = function() {
          console.log('Finished rendering:',currentIndex,'at:',frame,chunks);
          window.chunky = chunks;
          let blob = new Blob(chunks, {type: 'video/webm'});
          let url = URL.createObjectURL(blob);
          let a = document.createElement('a');
          document.body.appendChild(a);
          a.href = url;
          let filename = slicker.$slides.eq(currentIndex).find('p').text();
          filename = filename.substring(0,filename.lastIndexOf('.'));
          a.download = filename+'.webm';
          a.click();
          window.URL.revokeObjectURL(url);
          a.parentNode.removeChild(a);
          
          if(!inactive) beginRendering(++currentIndex);
        }
        $('.progress-bar').css('width', '0%').attr('aria-valuenow', 0);
        recorder.start();
        
        let replay = toRender[currentIndex],
          me = Object.keys(replay).find(k => replay[k].me == 'me'),
          fps = replay[me].fps+1; //+1 because setTimeout seems a little slow
        currentFrame = 0;
        currentMaxFrames = replay.clock.length;
        currentFpsDelay = 1000/fps;
        window.requestAnimationFrame(renderReplay.bind(this,currentFrame,currentMaxFrames,currentFpsDelay));
      }).bind(this,toRender,currentIndex));
    } else {
      rendering = false;
      inactive = true;
      $('#render').addClass('btn-success').removeClass('btn-primary').text('Render');
      $('#stop').addClass('disabled');
      console.log('No more replays to render');
    }
  }
  
  function pauseRendering() {
    if(recorder.state==='recording') {
      recorder.pause();
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
      recorder.resume();
      window.requestAnimationFrame(renderReplay.bind(this,++currentFrame,currentMaxFrames,currentFpsDelay));
    }
  }
  
  $('#render').click(function(e) {
    if(rendering) {
      pauseRendering();
    } else if(paused) {
      resumeRendering();
    } else if(inactive) {
      currentIndex = slicker.currentSlide;
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
      $('#render').addClass('btn-success').removeClass('btn-primary').text('Render');
      $('#stop').addClass('disabled');
    }
  });
  /*END RENDERING STUFF*/
  
  /*HACKY STUFF*/
  $.ajaxPrefilter( function (options) { //tricky stuff to grab html around cors
    if (options.crossDomain && jQuery.support.cors) {
      var http = (window.location.protocol === 'http:' ? 'http:' : 'https:');
      options.url = http + '//cors-anywhere.herokuapp.com/' + options.url;
    }
  });
  
  //for tricking the renderer into working
  window.module = {};
  window.require = function(what) {
    if(what==='./textures') {
      return {get: function() {
        let prom = new Promise(function(resolve,reject) { //idk how to use promises...
          resolve(true);
        })
        return prom.then(function() {
          let urls = [];
          for (let name in texturePack) {
            urls.push(texturePack[name]);
          }
          return loadImage(urls);
        }).then(function(images) {
          let out = {};
          let keys = Object.keys(texturePack)
          for (let i = 0; i < images.length; i++) {
            out[keys[i]] = images[i];
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
      $('#carousel').slick('slickAdd','<div class="filename-outer">'+
      '<div class="wrapper">'+
      '<p class="filename-inner center-text'+flag+'">'+jsons[i][0]+'</p>'+
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
  
  /*TEXTURE PICKING STUFF*/
  let frameWindow = document.getElementById('textureframe').contentWindow;
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
            let tname = 'Custom';
            let textures = window.decodeURIComponent(arguments[i]).replace(/\/textures/g,'https://static.koalabeast.com/textures');
            textures = textures.split('&');
            for(let i = 0;i < textures.length;i++) {
              let both = textures[i].split('=');
              if(texturePack[both[0]]) texturePack[both[0]] = both[1];
              else if(both[0]==='name' && both[1]!=='custom') tname = both[1];
            }
            $('#texturemodal').modal('hide');
            $('#options').modal('show');
            $('#tname').text('Current Texture Pack: '+tname);
            frameWindow.$(".texture-choice").removeClass("active-pack");
            frameWindow.$(".texture-choice[data-name='"+tname+"']").addClass("active-pack");
          }
        }
      };
    })(frameWindow.XMLHttpRequest.prototype.send);
  });
  document.getElementById('textureframe').onload = function() {
    frameWindow.$('#header, .footer').remove();
    frameWindow.document.body.style.marginBottom = 0;
    frameWindow.$(".texture-choice[data-name='Classic']").addClass("active-pack");
  }
  /*END TEXTURE PICKING STUFF*/
});