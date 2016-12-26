//Creative alternative adapted from http://stackoverflow.com/a/40691112 and https://www.html5rocks.com/en/tutorials/audio/scheduling/
//Used as a workaround to delayed timing of setTimeout in the background
function AudioTimeout() {
  this.context = new AudioContext();
  // Chrome needs our oscillator node to be attached to the destination
  // So we create a silent Gain Node
  let silence = this.context.createGain();
  silence.gain.value = 0;
  silence.connect(this.context.destination);
  
  this.delay = function(callback,when,data) {
    let freq = when/1000;
    let osc = this.context.createOscillator();
    window.oscnode = osc; //without this, it doesn't work sometimes. I'm not joking and I have no idea why. can also be replaced with anything accessing the 'osc' variable (console.log(osc), etc.)
    osc.onended = function() {
      callback(data);
    };
    osc.connect(silence);
    osc.start();
    osc.stop(this.context.currentTime + freq);
  }
}