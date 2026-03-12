const NUMBERS = [
  "zero",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf"
];

let currentNumber = 0;
let last = -1;

export default {

  mount(container){
    container.innerHTML = `
      <div class="tool-center">
        <div class="tool-row">

          <div class="tool-number" id="toolNumber"></div>

          <div class="tool-number">→</div>

          <img class="tool-img" id="toolSeyes" src="./tools/NombresLettres/seyes.png">

        </div>
      </div>
    `;
  },

  nextQuestion(container){

    do {
        currentNumber = Math.floor(Math.random() * 20);
    } while (currentNumber === last);

    last = currentNumber;

    const numEl = container.querySelector("#toolNumber");
    const img = container.querySelector("#toolSeyes");

    numEl.textContent = currentNumber;
    img.src = "./tools/NombresLettres/seyes.png";
  },

  showAnswer(container){

    const img = container.querySelector("#toolSeyes");

    const label = NUMBERS[currentNumber];

    img.src = `./tools/NombresLettres/labels/${label}.png`;
  }

};