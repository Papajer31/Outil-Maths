let n = 10;
let character = "picbille";

export default {

  mount(container){
    container.innerHTML = `
      <div class="tool-row">
        <div class="tool-number" id="rd_number"></div>
        <img class="tool-img" id="rd_img">
      </div>
    `;
  },

  nextQuestion(container){

    n = rand(10,69);

    character = Math.random() < 0.5
      ? "picbille"
      : "dede";

    container.querySelector("#rd_number").textContent = n;

    const img = container.querySelector("#rd_img");

    img.src = `./tools/ReprésentationDécimale/${character}.png`;
  },

  showAnswer(container){

    const img = container.querySelector("#rd_img");

    img.src =
      `./tools/ReprésentationDécimale/graphs/${character}/${n}.png`;

  },

  unmount(container){
    container.innerHTML = "";
  }

};


function rand(min,max){
  return Math.floor(Math.random()*(max-min+1))+min;
}