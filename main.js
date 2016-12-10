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
  recorder,
  chunks = [],
  rendering = false,
  paused = false,
  currentIndex = 0;
  
  function saveFrame(event) {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
  }
  
  function captureFrame() {
    let recorder = new MediaRecorder($('#game')[0].captureStream(0), {mimeType: 'video/webm'});
    recorder.ondataavailable = saveFrame;
    recorder.start();
    recorder.stop();
  }
  
  function renderReplay(replay,frame=0,frames) {
    if(frame<frames) {
      logger.trace(`Rendering frame ${frame} of ${frames}`);
      renderer.draw(frame);
      captureFrame();
      let frac = Math.round((frame+1)/frames*1000)/10;
      $('.progress-bar').css('width', frac+'%').attr('aria-valuenow', frac); 
      renderReplay(renderer,++frame,frames);
    }
  }
  
  function beginRendering() {
    rendering = true;
    while(currentIndex < toRender.length) {
      chunks = [];
      renderer = new Renderer($('#game')[0],toRender[currentIndex]);
      console.log(toRender[currentIndex])
      renderer.ready().then((function(toRender,currentIndex){
        renderReplay(toRender[currentIndex],0,toRender[currentIndex].clock.length)
      }).bind(null,toRender,currentIndex));
      var blob = new Blob(chunks, {type: 'video/webm'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      document.body.appendChild(a);
      a.href = url;
      a.download = 'testing.webm';
      //a.click();
      window.URL.revokeObjectURL(url);
      a.parentNode.removeChild(a);
      currentIndex++;
    }
  }
  
  function pauseRendering() {
    rendering = false;
    paused = true;
  }
  
  function resumeRendering() {
    rendering = true;
    paused = false;
  }
  
  $('#render').click(function(e) {
    if(rendering) {
      pauseRendering();
    } else if(paused) {
      resumeRendering();
    } else {
      beginRendering();
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
        let prom = new Promise(function(resolve,reject) {
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
            images[i].crossOrigin = 'anonymous';
            out[keys[i]] = images[i];
          }
          return out;
        });
      }}
    } else if(what==='./logger') return (function() {
      return console;
    });
    else if(what==='image-promise') {
      window.loadImage = window.loadI;
      return window.loadImage;
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
    console.log(anyGood);
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
    (function(send) {
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
            $('#textureframe').modal('hide');
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