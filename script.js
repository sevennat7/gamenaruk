/**
 * =========================================================================
 * เกมผจญภัย “เกาะมหาสมบัติทศนิยม” - Script Engine
 * พัฒนาสำหรับนักเรียนชั้น ป.4 และ ป.5
 * =========================================================================
 */

// =========================================================================
// 1. การตั้งค่าระบบ (CONFIG) - แก้ไขได้จุดเดียวที่นี่
// =========================================================================
const CONFIG = {
  // นำ URL ที่ได้จากการ Deploy Web App ของ Google Apps Script มาวางที่นี่
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyMHWNbnUoSuJBn94CA0rC8rtzF3Y5TF1SGCol2yUqfbr0Tk6iS16qDwNEckdXMdTTQrg/exec", 

  // รหัส Google Sheets สำหรับอ้างอิง
  SPREADSHEET_ID: "1pLchi-QIHnrhpfC3r4O-1g6_pqWyf1y6EBwvUpEldHo",

  // กติกาของเกม
  QUESTIONS_PER_STAGE: 5,
  PASS_STAGE_SCORE: 30, // คะแนนขั้นต่ำในการผ่านด่าน (จาก 50)
  POINTS_FIRST_TRY: 10,
  POINTS_SECOND_TRY: 5,
  TOTAL_STAGES: 3
};

// =========================================================================
// 2. ระบบเสียง Web Audio API (ไม่ต้องพึ่งพาไฟล์เสียงภายนอก)
// =========================================================================
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('decimal_sound_enabled') !== 'false';
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('decimal_sound_enabled', this.enabled);
    return this.enabled;
  }

  playTone(freq, duration, type = 'sine', gainVal = 0.15) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn("Audio error:", e);
    }
  }

  playClick() {
    this.playTone(600, 0.08, 'triangle', 0.1);
  }

  playCorrect() {
    if (!this.enabled) return;
    // เสียงคอร์ดไพเราะ C5 -> E5 -> G5 -> C6
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.25, 'sine', 0.15), i * 70);
    });
  }

  playWrong() {
    if (!this.enabled) return;
    // เสียงตึ๊งเบาๆ แจ้งเตือนแบบน่ารัก ไม่ตกใจ
    this.playTone(280, 0.18, 'sawtooth', 0.12);
    setTimeout(() => this.playTone(220, 0.25, 'sawtooth', 0.12), 120);
  }

  playStageClear() {
    if (!this.enabled) return;
    // เสียง Fanfare ฉลองผ่านด่าน
    const melody = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    melody.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.35, 'triangle', 0.2), i * 90);
    });
  }

  playTreasureChest() {
    if (!this.enabled) return;
    // เสียงเปิดหีบสมบัติวิบวับ
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        this.playTone(800 + i * 120, 0.15, 'sine', 0.12);
      }, i * 60);
    }
  }
}

const sounds = new SoundEngine();

// =========================================================================
// 3. ระบบคำนวณคณิตศาสตร์ทศนิยมด้วย Scaled Integers (ป้องกัน Floating Error)
// =========================================================================
const MathPrecision = {
  // หาจำนวนตำแหน่งทศนิยม
  getDecimals(numStr) {
    const parts = String(numStr).trim().split('.');
    return parts[1] ? parts[1].length : 0;
  },

  // ปรับสเกลทศนิยมเป็นจำนวนเต็มตามจำนวนตำแหน่งสูงสุด
  toScaledInt(numStr, scale) {
    const clean = String(numStr).trim();
    const parts = clean.split('.');
    const intPart = parts[0] || '0';
    let decPart = parts[1] || '';
    while (decPart.length < scale) decPart += '0';
    decPart = decPart.substring(0, scale);
    return BigInt(intPart + decPart);
  },

  // แปลงจำนวนเต็มที่สเกลกลับเป็นทศนิยม
  fromScaledInt(scaledInt, scale, trimTrailing = false) {
    if (scale === 0) return scaledInt.toString();
    const isNeg = scaledInt < 0n;
    const absVal = isNeg ? -scaledInt : scaledInt;
    let str = absVal.toString();
    while (str.length <= scale) str = '0' + str;
    const splitIndex = str.length - scale;
    const intPart = str.slice(0, splitIndex);
    let decPart = str.slice(splitIndex);

    if (trimTrailing) {
      decPart = decPart.replace(/0+$/, '');
      if (decPart === '') return (isNeg ? '-' : '') + intPart;
    }
    return (isNeg ? '-' : '') + `${intPart}.${decPart}`;
  },

  // บวกทศนิยมแม่นยำ 100%
  add(a, b) {
    const sA = String(a);
    const sB = String(b);
    const scale = Math.max(this.getDecimals(sA), this.getDecimals(sB));
    const intA = this.toScaledInt(sA, scale);
    const intB = this.toScaledInt(sB, scale);
    const sum = intA + intB;
    return this.fromScaledInt(sum, scale, false);
  },

  // ลบทศนิยมแม่นยำ 100% (ผลลัพธ์ไม่ติดลบ)
  sub(a, b) {
    const sA = String(a);
    const sB = String(b);
    const scale = Math.max(this.getDecimals(sA), this.getDecimals(sB));
    const intA = this.toScaledInt(sA, scale);
    const intB = this.toScaledInt(sB, scale);
    const diff = intA - intB;
    return this.fromScaledInt(diff, scale, false);
  },

  // เปรียบเทียบความเท่ากันของทศนิยม เช่น 1.5 เท่ากับ 1.50
  areEqual(val1, val2) {
    if (val1 === undefined || val1 === null || val2 === undefined || val2 === null) return false;
    const c1 = String(val1).trim().replace(',', '.');
    const c2 = String(val2).trim().replace(',', '.');
    if (c1 === '' || c2 === '') return false;
    const n1 = parseFloat(c1);
    const n2 = parseFloat(c2);
    if (isNaN(n1) || isNaN(n2)) return false;
    return Math.abs(n1 - n2) < 1e-7;
  },

  // จัดรูปแบบแสดงผลทศนิยมให้สะอาดตา
  formatClean(val) {
    const str = String(val).trim();
    if (!str.includes('.')) return str;
    return str.replace(/\.?0+$/, '');
  }
};

// =========================================================================
// 4. คลังโจทย์และตัวสร้างโจทย์แบบสุ่ม (ป.4 และ ป.5)
// =========================================================================
class QuestionGenerator {
  // สุ่มเลขจำนวนเต็มในช่วง [min, max]
  static randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // สร้างโจทย์สำหรับด่านที่ 1: ป่าบวกเลข (บวก 1-2 ตำแหน่ง)
  static generateStage1(grade) {
    const isGrade4 = grade === 'ป.4';
    const subType = this.randInt(1, 4);
    let op1, op2;

    if (subType === 1) {
      // 1 ตำแหน่ง + 1 ตำแหน่ง
      op1 = (this.randInt(10, 89) / 10).toFixed(1);
      op2 = (this.randInt(10, 89) / 10).toFixed(1);
    } else if (subType === 2) {
      // 2 ตำแหน่ง + 2 ตำแหน่ง (มีทด)
      op1 = (this.randInt(110, 890) / 100).toFixed(2);
      op2 = (this.randInt(110, 890) / 100).toFixed(2);
    } else if (subType === 3) {
      // ตำแหน่งไม่เท่ากัน: 1 ตำแหน่ง + 2 ตำแหน่ง
      op1 = (this.randInt(15, 95) / 10).toFixed(1);
      op2 = (this.randInt(115, 785) / 100).toFixed(2);
    } else {
      // จำนวนนับ + ทศนิยม 2 ตำแหน่ง หรือโจทย์ท้าทาย
      if (isGrade4) {
        op1 = (this.randInt(1, 9)).toString();
        op2 = (this.randInt(125, 675) / 100).toFixed(2);
      } else {
        op1 = (this.randInt(120, 450) / 10).toFixed(1);
        op2 = (this.randInt(1550, 4850) / 100).toFixed(2);
      }
    }

    const answer = MathPrecision.add(op1, op2);
    const expression = `${op1} + ${op2} = ?`;
    const carryExists = this.checkCarry(op1, op2, '+');

    return {
      stage: 1,
      stageName: "ป่าบวกเลข",
      operation: "+",
      op1,
      op2,
      expression,
      answer,
      carryExists,
      story: null,
      topicTag: MathPrecision.getDecimals(op1) !== MathPrecision.getDecimals(op2) 
        ? "การบวกทศนิยมตำแหน่งไม่เท่ากัน" 
        : (carryExists ? "การบวกทศนิยมแบบมีทด" : "การบวกทศนิยมตรงหลัก"),
      hint: MathPrecision.getDecimals(op1) !== MathPrecision.getDecimals(op2)
        ? `สังเกตนะ! ${op1} มี ${MathPrecision.getDecimals(op1)} ตำแหน่ง ส่วน ${op2} มี ${MathPrecision.getDecimals(op2)} ตำแหน่ง ให้เติม 0 ท้ายหลักที่สั้นกว่าเพื่อให้ตำแหน่งตรงกันนะ`
        : "ตั้งจุดทศนิยมของตัวตั้งและตัวบวกให้ตรงกันเสมอ แล้วบวกจากขวาไปซ้าย หากได้เกิน 9 อย่าลืมทดไปหลักหน้า!"
    };
  }

  // สร้างโจทย์สำหรับด่านที่ 2: ถ้ำลบเลข (ลบ 1-2 ตำแหน่ง ไม่ติดลบ)
  static generateStage2(grade) {
    const isGrade4 = grade === 'ป.4';
    const subType = this.randInt(1, 4);
    let op1, op2;

    if (subType === 1) {
      // 1 ตำแหน่ง - 1 ตำแหน่ง
      const a = this.randInt(35, 98);
      const b = this.randInt(11, a - 5);
      op1 = (a / 10).toFixed(1);
      op2 = (b / 10).toFixed(1);
    } else if (subType === 2) {
      // 2 ตำแหน่ง - 2 ตำแหน่ง (มีการยืม)
      const a = this.randInt(450, 950);
      const b = this.randInt(120, a - 50);
      op1 = (a / 100).toFixed(2);
      op2 = (b / 100).toFixed(2);
    } else if (subType === 3) {
      // ตำแหน่งต่างกัน: 1 ตำแหน่ง - 2 ตำแหน่ง (ต้องเติม 0 ตัวตั้ง เช่น 5.2 - 3.48)
      const intA = this.randInt(4, 9);
      const decA = this.randInt(1, 8);
      op1 = `${intA}.${decA}`; // เช่น 5.2
      const decB = this.randInt(15, 85);
      const intB = this.randInt(1, intA - 1);
      op2 = `${intB}.${decB < 10 ? '0' + decB : decB}`;
    } else {
      // จำนวนนับ - ทศนิยม (เช่น 8 - 3.45)
      const intA = this.randInt(isGrade4 ? 5 : 12, isGrade4 ? 15 : 25);
      const intB = this.randInt(1, intA - 2);
      const decB = this.randInt(15, 85);
      op1 = intA.toString();
      op2 = `${intB}.${decB < 10 ? '0' + decB : decB}`;
    }

    // สลับให้ตัวตั้งมากกว่าหรือเท่ากับตัวลบเสมอ
    if (parseFloat(op1) < parseFloat(op2)) {
      const temp = op1;
      op1 = op2;
      op2 = temp;
    }

    const answer = MathPrecision.sub(op1, op2);
    const expression = `${op1} - ${op2} = ?`;
    const borrowExists = this.checkBorrow(op1, op2);

    return {
      stage: 2,
      stageName: "ถ้ำลบเลข",
      operation: "-",
      op1,
      op2,
      expression,
      answer,
      borrowExists,
      story: null,
      topicTag: MathPrecision.getDecimals(op1) < MathPrecision.getDecimals(op2)
        ? "การลบทศนิยมที่ตัวตั้งมีตำแหน่งน้อยกว่า (เติม 0 ตัวตั้ง)"
        : (borrowExists ? "การลบทศนิยมแบบมีการกระจาย/ยืม" : "การลบทศนิยมตรงหลัก"),
      hint: MathPrecision.getDecimals(op1) < MathPrecision.getDecimals(op2)
        ? `ตัวตั้ง ${op1} ต้องเติม 0 ต่อท้ายเป็น ${op1}0 เพื่อให้ลบกับ ${op2} ได้ และยืมหลักหน้าตามปกติ`
        : "ตั้งจุดทศนิยมให้ตรงกัน หากตัวบนน้อยกว่าตัวล่าง ให้ยืมจากหลักทางซ้ายมา 10 แล้วค่อยลบนะ"
    };
  }

  // สร้างโจทย์สำหรับด่านที่ 3: ปราสาทสมบัติ (ทศนิยมถึง 3 ตำแหน่ง & โจทย์สถานการณ์)
  static generateStage3(grade) {
    const isGrade4 = grade === 'ป.4';
    const isWordProblem = Math.random() < 0.55; // สลับเป็นโจทย์ปัญหา 55%

    if (isWordProblem) {
      return this.generateWordProblem(grade);
    }

    // โจทย์คำนวณตัวเลข
    const isAdd = Math.random() < 0.5;
    let op1, op2;

    if (isGrade4) {
      // ป.4: 1-2 ตำแหน่ง ตัวเลขใหญ่ขึ้นหรือผสม
      op1 = (this.randInt(150, 850) / 10).toFixed(1);
      op2 = (this.randInt(225, 775) / 100).toFixed(2);
    } else {
      // ป.5: ทศนิยม 3 ตำแหน่ง
      const type = this.randInt(1, 3);
      if (type === 1) {
        op1 = (this.randInt(1125, 6875) / 1000).toFixed(3);
        op2 = (this.randInt(1125, 4875) / 1000).toFixed(3);
      } else if (type === 2) {
        // 2 ตำแหน่ง ผสม 3 ตำแหน่ง
        op1 = (this.randInt(350, 950) / 100).toFixed(2);
        op2 = (this.randInt(1125, 2875) / 1000).toFixed(3);
      } else {
        op1 = (this.randInt(12, 25)).toString();
        op2 = (this.randInt(2125, 8875) / 1000).toFixed(3);
      }
    }

    if (!isAdd && parseFloat(op1) < parseFloat(op2)) {
      const temp = op1;
      op1 = op2;
      op2 = temp;
    }

    const answer = isAdd ? MathPrecision.add(op1, op2) : MathPrecision.sub(op1, op2);
    const expression = `${op1} ${isAdd ? '+' : '-'} ${op2} = ?`;

    return {
      stage: 3,
      stageName: "ปราสาทสมบัติ",
      operation: isAdd ? "+" : "-",
      op1,
      op2,
      expression,
      answer,
      story: null,
      topicTag: isGrade4 ? "การบวก-ลบทศนิยม 2 ตำแหน่งระดับสูง" : "การบวก-ลบทศนิยม 3 ตำแหน่ง",
      hint: "สังเกตตำแหน่งทศนิยมให้ดี! เติม 0 ในหลักที่แหว่งให้มี 3 ตำแหน่งเท่ากัน แล้วตั้งจุดให้ตรงกันเพื่อคำนวณ"
    };
  }

  // สร้างโจทย์ปัญหาบริบทชีวิตจริง (เงิน, ความยาว, น้ำหนัก)
  static generateWordProblem(grade) {
    const isGrade4 = grade === 'ป.4';
    const scenarios = [
      // เงิน
      {
        type: 'money_add',
        title: "ซื้อของที่ตลาดเกาะสมบัติ",
        template: (a, b) => `กัปตันซื้อเข็มทิศราคา ${a} บาท และซื้อแผนที่เดินเรือราคา ${b} บาท รวมเป็นเงินทั้งหมดกี่บาท?`,
        gen: () => {
          const a = (this.randInt(35, 120) + (this.randInt(1, 3) * 0.25)).toFixed(2);
          const b = (this.randInt(20, 85) + (this.randInt(1, 3) * 0.25)).toFixed(2);
          return { op1: a, op2: b, op: '+', unit: 'บาท' };
        }
      },
      {
        type: 'money_change',
        title: "เงินทอนค่าเสบียง",
        template: (a, b) => `ลูกเรือให้ธนบัตร ${a} บาท เพื่อซื้อผลไม้บนเกาะราคา ${b} บาท จะได้รับเงินทอนกี่บาท?`,
        gen: () => {
          const a = isGrade4 ? "100" : "500";
          const b = (this.randInt(25, isGrade4 ? 85 : 350) + (this.randInt(1, 3) * 0.25)).toFixed(2);
          return { op1: a, op2: b, op: '-', unit: 'บาท' };
        }
      },
      // ความยาว / ระยะทาง
      {
        type: 'length_cut',
        title: "ตัดเชือกผูกเรือใบ",
        template: (a, b) => `เชือกเส้นหนึ่งยาว ${a} เมตร กัปตันตัดไปผูกเสากระโดงเรือ ${b} เมตร จะเหลือเชือกยาวกี่เมตร?`,
        gen: () => {
          const a = (this.randInt(8, 20) + (this.randInt(1, 9) / 10)).toFixed(isGrade4 ? 1 : 2);
          const b = (this.randInt(2, 6) + (this.randInt(15, 85) / 100)).toFixed(2);
          return { op1: a, op2: b, op: '-', unit: 'เมตร' };
        }
      },
      // น้ำหนัก
      {
        type: 'weight_total',
        title: "ชั่งน้ำหนักหีบสมบัติ",
        template: (a, b) => `หีบทองคำหนัก ${a} กิโลกรัม หีบเพชรพลอยหนัก ${b} กิโลกรัม นำมารวมกันจะหนักทั้งหมดกี่กิโลกรัม?`,
        gen: () => {
          if (isGrade4) {
            const a = (this.randInt(12, 35) + (this.randInt(1, 9) / 10)).toFixed(1);
            const b = (this.randInt(5, 18) + (this.randInt(15, 85) / 100)).toFixed(2);
            return { op1: a, op2: b, op: '+', unit: 'กิโลกรัม' };
          } else {
            const a = (this.randInt(8, 25) + (this.randInt(125, 875) / 1000)).toFixed(3);
            const b = (this.randInt(4, 15) + (this.randInt(125, 875) / 1000)).toFixed(3);
            return { op1: a, op2: b, op: '+', unit: 'กิโลกรัม' };
          }
        }
      }
    ];

    const scenario = scenarios[this.randInt(0, scenarios.length - 1)];
    const data = scenario.gen();
    let op1 = data.op1;
    let op2 = data.op2;

    if (data.op === '-' && parseFloat(op1) < parseFloat(op2)) {
      const temp = op1;
      op1 = op2;
      op2 = temp;
    }

    const answer = data.op === '+' ? MathPrecision.add(op1, op2) : MathPrecision.sub(op1, op2);
    const story = scenario.template(op1, op2);
    const expression = `${op1} ${data.op} ${op2} = ? (${data.unit})`;

    return {
      stage: 3,
      stageName: "ปราสาทสมบัติ",
      operation: data.op,
      op1,
      op2,
      expression,
      answer,
      story,
      unit: data.unit,
      topicTag: `โจทย์ปัญหาสถานการณ์ (${scenario.title})`,
      hint: `อ่านโจทย์แล้วดูว่าเป็นวิธี${data.op === '+' ? 'บวก' : 'ลบ'} จากนั้นนำตัวเลขมาตั้งจุดทศนิยมให้ตรงกัน อย่าลืมใส่หน่วย (${data.unit}) ด้วยนะ`
    };
  }

  // ตรวจสอบว่ามีการทดหรือไม่
  static checkCarry(a, b, op) {
    if (op !== '+') return false;
    const maxDec = Math.max(MathPrecision.getDecimals(a), MathPrecision.getDecimals(b));
    const intA = MathPrecision.toScaledInt(a, maxDec).toString();
    const intB = MathPrecision.toScaledInt(b, maxDec).toString();
    const len = Math.max(intA.length, intB.length);
    const pA = intA.padStart(len, '0');
    const pB = intB.padStart(len, '0');
    let carry = 0;
    for (let i = len - 1; i >= 0; i--) {
      const sum = Number(pA[i]) + Number(pB[i]) + carry;
      if (sum >= 10) return true;
      carry = Math.floor(sum / 10);
    }
    return false;
  }

  // ตรวจสอบว่ามีการยืมหรือไม่
  static checkBorrow(a, b) {
    const maxDec = Math.max(MathPrecision.getDecimals(a), MathPrecision.getDecimals(b));
    const intA = MathPrecision.toScaledInt(a, maxDec).toString();
    const intB = MathPrecision.toScaledInt(b, maxDec).toString();
    const len = Math.max(intA.length, intB.length);
    const pA = intA.padStart(len, '0');
    const pB = intB.padStart(len, '0');
    for (let i = len - 1; i >= 0; i--) {
      if (Number(pA[i]) < Number(pB[i])) return true;
    }
    return false;
  }

  // สร้าง 4 ช้อยส์ตัวเลือกแบบมีตัวลวงที่สมเหตุสมผล
  static generateChoices(question) {
    const correct = question.answer;
    const correctNum = parseFloat(correct);
    const distractors = new Set();

    // ตัวลวงที่ 1: ลืมทด หรือ ลืมยืม
    distractors.add(this.createOffsetDistractor(correct, 0.1));
    distractors.add(this.createOffsetDistractor(correct, -0.1));

    // ตัวลวงที่ 2: วางหลักทศนิยมผิด (ลืมเติม 0)
    if (MathPrecision.getDecimals(question.op1) !== MathPrecision.getDecimals(question.op2)) {
      const wrongAlign = MathPrecision.formatClean((correctNum + 0.09).toFixed(2));
      distractors.add(wrongAlign);
    }

    // ตัวลวงที่ 3: สลับเครื่องหมาย หรือคำนวณคลาดเคลื่อนเล็กน้อย
    distractors.add(this.createOffsetDistractor(correct, 0.01));
    distractors.add(this.createOffsetDistractor(correct, -0.01));
    distractors.add(this.createOffsetDistractor(correct, 1.0));

    // คัดกรองตัวลวงไม่ให้ซ้ำกับคำตอบจริง
    const cleanDistractors = [];
    for (const d of distractors) {
      if (!MathPrecision.areEqual(d, correct) && parseFloat(d) > 0) {
        cleanDistractors.push(d);
      }
      if (cleanDistractors.length >= 3) break;
    }

    // ถ้าไม่ครบ 3 ตัว ให้เติมตัวเลขสุ่มใกล้เคียง
    while (cleanDistractors.length < 3) {
      const delta = (this.randInt(1, 5) * 0.1).toFixed(1);
      const fake = (correctNum + parseFloat(delta)).toFixed(MathPrecision.getDecimals(correct));
      if (!cleanDistractors.includes(fake) && !MathPrecision.areEqual(fake, correct)) {
        cleanDistractors.push(fake);
      }
    }

    // รวมคำตอบจริงและสับเปลี่ยนลำดับ (Shuffle)
    const allOptions = [correct, ...cleanDistractors.slice(0, 3)];
    for (let i = allOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }

    return allOptions;
  }

  static createOffsetDistractor(numStr, offset) {
    const val = parseFloat(numStr) + offset;
    const dec = MathPrecision.getDecimals(numStr);
    return Math.max(0.01, val).toFixed(dec > 0 ? dec : 1);
  }

  // สร้างชุดโจทย์ 5 ข้อไม่ซ้ำกันสำหรับด่านนั้น
  static generateStageQuestions(stage, grade) {
    const questions = [];
    const usedExpressions = new Set();

    while (questions.length < CONFIG.QUESTIONS_PER_STAGE) {
      let q;
      if (stage === 1) q = this.generateStage1(grade);
      else if (stage === 2) q = this.generateStage2(grade);
      else q = this.generateStage3(grade);

      if (!usedExpressions.has(q.expression)) {
        usedExpressions.add(q.expression);
        // สลับประเภทคำถาม: ข้อที่ 1, 3, 5 เป็นแบบเลือกตอบ 4 ช้อยส์ / ข้อที่ 2, 4 เป็นกรอกตัวเลข
        q.isChoiceType = (questions.length % 2 === 0);
        if (q.isChoiceType) {
          q.choices = this.generateChoices(q);
        }
        questions.push(q);
      }
    }

    return questions;
  }
}

// =========================================================================
// 5. ตัวสร้างภาพตารางตั้งจุดทศนิยม (Column Alignment Chalkboard Renderer)
// =========================================================================
class ColumnMathRenderer {
  /**
   * สร้าง HTML ตารางตัวเลขตั้งหลักจุดตรงกัน
   */
  static render(question) {
    const op1 = String(question.op1);
    const op2 = String(question.op2);
    const operator = question.operation;
    const answer = String(question.answer);

    const dec1 = MathPrecision.getDecimals(op1);
    const dec2 = MathPrecision.getDecimals(op2);
    const maxDec = Math.max(dec1, dec2);

    // ปรับเติม 0 ให้จำนวนตำแหน่งทศนิยมเท่ากัน
    const parts1 = op1.split('.');
    const int1 = parts1[0];
    let frac1 = parts1[1] || '';
    const padCount1 = maxDec - frac1.length;
    while (frac1.length < maxDec) frac1 += '0';

    const parts2 = op2.split('.');
    const int2 = parts2[0];
    let frac2 = parts2[1] || '';
    const padCount2 = maxDec - frac2.length;
    while (frac2.length < maxDec) frac2 += '0';

    const maxIntLen = Math.max(int1.length, int2.length, answer.split('.')[0].length);
    const padInt1 = int1.padStart(maxIntLen, ' ');
    const padInt2 = int2.padStart(maxIntLen, ' ');

    let html = `<div class="column-math-table">`;

    // บรรทัดที่ 1: ตัวตั้ง
    html += `<div class="math-row">`;
    html += `<span class="math-cell operator-symbol" style="visibility: hidden;">${operator}</span>`;
    for (let i = 0; i < maxIntLen; i++) {
      const ch = padInt1[i] === ' ' ? '&nbsp;' : padInt1[i];
      html += `<span class="math-cell">${ch}</span>`;
    }
    if (maxDec > 0) {
      html += `<span class="math-cell dot">.</span>`;
      for (let i = 0; i < frac1.length; i++) {
        const isPadded = (i >= frac1.length - padCount1 && padCount1 > 0);
        html += `<span class="math-cell ${isPadded ? 'padded-zero' : ''}">${frac1[i]}</span>`;
      }
    }
    html += `</div>`;

    // บรรทัดที่ 2: ตัวบวก/ตัวลบ พร้อมเครื่องหมาย
    html += `<div class="math-row operator-row">`;
    html += `<span class="math-cell operator-symbol">${operator}</span>`;
    for (let i = 0; i < maxIntLen; i++) {
      const ch = padInt2[i] === ' ' ? '&nbsp;' : padInt2[i];
      html += `<span class="math-cell">${ch}</span>`;
    }
    if (maxDec > 0) {
      html += `<span class="math-cell dot">.</span>`;
      for (let i = 0; i < frac2.length; i++) {
        const isPadded = (i >= frac2.length - padCount2 && padCount2 > 0);
        html += `<span class="math-cell ${isPadded ? 'padded-zero' : ''}">${frac2[i]}</span>`;
      }
    }
    html += `</div>`;

    // เส้นคั่นเส้นเดียว
    html += `<div class="math-divider"></div>`;

    // บรรทัดที่ 3: ผลลัพธ์
    const ansParts = answer.split('.');
    const ansInt = ansParts[0].padStart(maxIntLen, ' ');
    const ansFrac = ansParts[1] || '';

    html += `<div class="math-row result-row">`;
    html += `<span class="math-cell operator-symbol" style="visibility: hidden;">=</span>`;
    for (let i = 0; i < maxIntLen; i++) {
      const ch = ansInt[i] === ' ' ? '&nbsp;' : ansInt[i];
      html += `<span class="math-cell">${ch}</span>`;
    }
    if (maxDec > 0) {
      html += `<span class="math-cell dot">.</span>`;
      for (let i = 0; i < ansFrac.length; i++) {
        html += `<span class="math-cell">${ansFrac[i]}</span>`;
      }
    }
    html += `</div>`;

    // เส้นคั่นสองเส้นใต้ผลลัพธ์
    html += `<div class="math-divider double-line"></div>`;
    html += `</div>`;

    return html;
  }

  /**
   * สร้างคำอธิบายขั้นตอนการคิด
   */
  static renderRules(question) {
    const isAdd = question.operation === '+';
    const dec1 = MathPrecision.getDecimals(question.op1);
    const dec2 = MathPrecision.getDecimals(question.op2);
    const unequal = dec1 !== dec2;

    let rules = `<ul>`;
    rules += `<li><strong>ขั้นที่ 1:</strong> ตั้งจุดทศนิยมของตัวตั้ง (${question.op1}) และตัว${isAdd ? 'บวก' : 'ลบ'} (${question.op2}) ให้ตรงกันในแนวดิ่ง</li>`;
    
    if (unequal) {
      rules += `<li><strong>ขั้นที่ 2 (สำคัญ):</strong> เนื่องจากตำแหน่งทศนิยมไม่เท่ากัน (${dec1} ตำแหน่ง กับ ${dec2} ตำแหน่ง) ให้<strong>เติม 0 ท้ายหลักที่ขาด</strong> เพื่อให้มีตำแหน่งเท่ากัน จะช่วยให้มองหลักง่ายขึ้น</li>`;
    } else {
      rules += `<li><strong>ขั้นที่ 2:</strong> ตรวจดูจำนวนตำแหน่งทศนิยม พบว่ามี ${dec1} ตำแหน่งเท่ากันแล้ว</li>`;
    }

    rules += `<li><strong>ขั้นที่ 3:</strong> ทำการ${isAdd ? 'บวก' : 'ลบ'}จากขวาสุดไปซ้ายสุด เหมือนการ${isAdd ? 'บวก' : 'ลบ'}จำนวนนับทั่วไป</li>`;
    rules += `<li><strong>ขั้นที่ 4:</strong> วางจุดทศนิยมของผลลัพธ์ให้ตรงกับจุดด้านบน จะได้คำตอบคือ <strong>${question.answer}</strong></li>`;
    rules += `</ul>`;

    return rules;
  }
}

// =========================================================================
// 6. ระบบฐานข้อมูล Google Apps Script & Offline Sync
// =========================================================================
class DatabaseSync {
  static getPending() {
    try {
      const raw = localStorage.getItem('decimal_pending_submissions');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  static savePending(payload) {
    const list = this.getPending();
    list.push(payload);
    localStorage.setItem('decimal_pending_submissions', JSON.stringify(list));
  }

  static removePending(sessionId) {
    const list = this.getPending().filter(item => item.sessionId !== sessionId);
    localStorage.setItem('decimal_pending_submissions', JSON.stringify(list));
  }

  static async submitGameResults(payload, onStatusChange) {
    // 1. ตรวจสอบว่ามี URL หรือยัง
    if (!CONFIG.APPS_SCRIPT_URL || CONFIG.APPS_SCRIPT_URL.trim() === "") {
      this.savePending(payload);
      if (onStatusChange) {
        onStatusChange({
          status: 'offline_stored',
          message: 'บันทึกข้อมูลในเครื่องเรียบร้อยแล้ว (ยังไม่ได้ตั้งค่า Google Apps Script Web App URL)'
        });
      }
      return false;
    }

    if (onStatusChange) {
      onStatusChange({
        status: 'sending',
        message: 'กำลังส่งข้อมูลไปยัง Google Apps Script...'
      });
    }

    try {
      // ใช้ fetch แบบ POST ส่งข้อความ text/plain ป้องกันปัญหา CORS Preflight ใน Google Apps Script
      const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const result = await response.json();

      if (result.status === 'success') {
        this.removePending(payload.sessionId);
        if (onStatusChange) {
          onStatusChange({
            status: 'success',
            message: 'บันทึกลง Google Sheets เรียบร้อยแล้ว ✅'
          });
        }
        return true;
      } else {
        throw new Error(result.message || 'API Error');
      }

    } catch (err) {
      console.warn("Sync error, saving to pending queue:", err);
      this.savePending(payload);
      if (onStatusChange) {
        onStatusChange({
          status: 'error',
          message: `ไม่สามารถเชื่อมต่อชีตได้ (${err.message}) ผลคะแนนถูกเก็บไว้ในเครื่องแล้ว สามารถกดส่งใหม่ได้`
        });
      }
      return false;
    }
  }
}

// =========================================================================
// 7. การจัดการสถานะของเกม (Game State Controller)
// =========================================================================
class GameController {
  constructor() {
    this.player = {
      playerId: "p_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      nickname: "",
      grade: "ป.4",
      createdAt: new Date().toISOString()
    };

    this.sessionId = "sess_" + Date.now();
    this.currentStage = 1; // 1: ป่าบวก, 2: ถ้ำลบ, 3: ปราสาทสมบัติ
    this.stageScores = { 1: 0, 2: 0, 3: 0 };
    this.stagePassed = { 1: false, 2: false, 3: false };

    this.currentQuestionIndex = 0;
    this.stageQuestions = [];
    this.currentQuestion = null;
    this.currentAttempt = 1; // 1 หรือ 2
    this.allAnswersRecord = []; // บันทึกข้อทั้งหมดสำหรับส่งชีต
    this.correctFirstTryCount = 0;
    this.correctSecondTryCount = 0;
    this.mistakeTopics = new Set(); // วิเคราะห์หัวข้อที่ควรฝึก

    this.initDOM();
    this.bindEvents();
    this.initScratchpad();
  }

  initDOM() {
    // Screens
    this.screens = {
      welcome: document.getElementById('screenWelcome'),
      map: document.getElementById('screenMap'),
      game: document.getElementById('screenGame'),
      stageResult: document.getElementById('screenStageResult'),
      summary: document.getElementById('screenSummary')
    };

    // Header Elements
    this.headerPlayerInfo = document.getElementById('headerPlayerInfo');
    this.navPlayerName = document.getElementById('navPlayerName');
    this.navPlayerGrade = document.getElementById('navPlayerGrade');
    this.navTotalScore = document.getElementById('navTotalScore');
    this.soundIcon = document.getElementById('soundIcon');
    this.btnToggleSound = document.getElementById('btnToggleSound');
    this.btnHome = document.getElementById('btnHome');
    this.btnHelp = document.getElementById('btnHelp');

    // Registration Elements
    this.inputNickname = document.getElementById('inputNickname');
    this.btnStartGame = document.getElementById('btnStartGame');

    // Map Elements
    this.stationStage1 = document.getElementById('stationStage1');
    this.stationStage2 = document.getElementById('stationStage2');
    this.stationStage3 = document.getElementById('stationStage3');
    this.btnEnterStage1 = document.getElementById('btnEnterStage1');
    this.btnEnterStage2 = document.getElementById('btnEnterStage2');
    this.btnEnterStage3 = document.getElementById('btnEnterStage3');
    this.badgeStage1Score = document.getElementById('badgeStage1Score');
    this.badgeStage2Score = document.getElementById('badgeStage2Score');
    this.badgeStage3Score = document.getElementById('badgeStage3Score');
    this.mapProgressCount = document.getElementById('mapProgressCount');
    this.mapGuideText = document.getElementById('mapGuideText');

    // Game Elements
    this.gameStageIcon = document.getElementById('gameStageIcon');
    this.gameStageName = document.getElementById('gameStageName');
    this.gameStageTopic = document.getElementById('gameStageTopic');
    this.gameStageScore = document.getElementById('gameStageScore');
    this.gameQuestionNumText = document.getElementById('gameQuestionNumText');
    this.gameAttemptBadge = document.getElementById('gameAttemptBadge');
    this.gameProgressBar = document.getElementById('gameProgressBar');
    this.questionTypeBadge = document.getElementById('questionTypeBadge');
    this.questionGradeBadge = document.getElementById('questionGradeBadge');
    this.problemStory = document.getElementById('problemStory');
    this.mathExpression = document.getElementById('mathExpression');
    this.choicesGrid = document.getElementById('choicesGrid');
    this.directInputSection = document.getElementById('directInputSection');
    this.userDirectInput = document.getElementById('userDirectInput');
    this.btnSubmitDirect = document.getElementById('btnSubmitDirect');
    this.hintAlertBox = document.getElementById('hintAlertBox');
    this.hintText = document.getElementById('hintText');
    this.btnRetryQuestion = document.getElementById('btnRetryQuestion');
    this.explanationBox = document.getElementById('explanationBox');
    this.expResultIcon = document.getElementById('expResultIcon');
    this.expResultTitle = document.getElementById('expResultTitle');
    this.chalkMathContainer = document.getElementById('chalkMathContainer');
    this.chalkRulesGuide = document.getElementById('chalkRulesGuide');
    this.btnNextQuestion = document.getElementById('btnNextQuestion');

    // Stage Result Elements
    this.passResultView = document.getElementById('passResultView');
    this.failResultView = document.getElementById('failResultView');
    this.resPassStageName = document.getElementById('resPassStageName');
    this.resPassScore = document.getElementById('resPassScore');
    this.starsAwarded = document.getElementById('starsAwarded');
    this.btnContinueNextStage = document.getElementById('btnContinueNextStage');
    this.btnBackToMapFromPass = document.getElementById('btnBackToMapFromPass');
    this.resFailStageName = document.getElementById('resFailStageName');
    this.resFailScore = document.getElementById('resFailScore');
    this.btnReplayStage = document.getElementById('btnReplayStage');
    this.btnBackToMapFromFail = document.getElementById('btnBackToMapFromFail');

    // Final Summary Elements
    this.sumPlayerName = document.getElementById('sumPlayerName');
    this.sumPlayerGrade = document.getElementById('sumPlayerGrade');
    this.sumTotalScore = document.getElementById('sumTotalScore');
    this.sumRankTitle = document.getElementById('sumRankTitle');
    this.sumStage1Score = document.getElementById('sumStage1Score');
    this.sumStage2Score = document.getElementById('sumStage2Score');
    this.sumStage3Score = document.getElementById('sumStage3Score');
    this.sumFirstTryCount = document.getElementById('sumFirstTryCount');
    this.sumSecondTryCount = document.getElementById('sumSecondTryCount');
    this.sumImproveList = document.getElementById('sumImproveList');
    this.dbStatusIcon = document.getElementById('dbStatusIcon');
    this.dbStatusTitle = document.getElementById('dbStatusTitle');
    this.dbStatusSub = document.getElementById('dbStatusSub');
    this.btnRetrySync = document.getElementById('btnRetrySync');
    this.btnToggleReview = document.getElementById('btnToggleReview');
    this.reviewAnswersList = document.getElementById('reviewAnswersList');
    this.btnPlayAgain = document.getElementById('btnPlayAgain');
    this.btnPrintCert = document.getElementById('btnPrintCert');

    // Modals
    this.modalHelp = document.getElementById('modalHelp');
    this.btnCloseHelp = document.getElementById('btnCloseHelp');
    this.btnDismissHelp = document.getElementById('btnDismissHelp');

    // Scratchpad
    this.btnToggleScratchpad = document.getElementById('btnToggleScratchpad');
    this.scratchpadPanel = document.getElementById('scratchpadPanel');
    this.btnClearScratchpad = document.getElementById('btnClearScratchpad');
    this.btnCloseScratchpad = document.getElementById('btnCloseScratchpad');
    this.scratchCanvas = document.getElementById('scratchpadCanvas');
  }

  showScreen(name) {
    Object.values(this.screens).forEach(scr => {
      scr.classList.remove('active');
      scr.style.display = 'none';
    });
    const target = this.screens[name];
    if (target) {
      target.style.display = 'block';
      setTimeout(() => target.classList.add('active'), 20);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  bindEvents() {
    // Sound Toggle
    this.btnToggleSound.addEventListener('click', () => {
      const active = sounds.toggle();
      this.soundIcon.textContent = active ? '🔊' : '🔇';
      if (active) sounds.playClick();
    });

    // Start Game
    this.btnStartGame.addEventListener('click', () => this.handleRegistration());

    // Enter Stages from Map
    this.btnEnterStage1.addEventListener('click', () => this.startStage(1));
    this.btnEnterStage2.addEventListener('click', () => this.startStage(2));
    this.btnEnterStage3.addEventListener('click', () => this.startStage(3));

    // Submit Direct Answer
    this.btnSubmitDirect.addEventListener('click', () => this.handleAnswerSubmit(this.userDirectInput.value));
    this.userDirectInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleAnswerSubmit(this.userDirectInput.value);
      }
    });

    // Virtual Keypad
    document.querySelectorAll('.kp-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        sounds.playClick();
        const val = btn.dataset.val;
        if (val !== undefined) {
          this.userDirectInput.value += val;
          this.userDirectInput.focus();
        }
      });
    });

    const btnBack = document.getElementById('btnKpBackspace');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        sounds.playClick();
        this.userDirectInput.value = this.userDirectInput.value.slice(0, -1);
      });
    }

    const btnClr = document.getElementById('btnKpClear');
    if (btnClr) {
      btnClr.addEventListener('click', () => {
        sounds.playClick();
        this.userDirectInput.value = "";
      });
    }

    const btnSub = document.getElementById('btnKpSubmit');
    if (btnSub) {
      btnSub.addEventListener('click', () => {
        this.handleAnswerSubmit(this.userDirectInput.value);
      });
    }

    // Hint Retry
    this.btnRetryQuestion.addEventListener('click', () => {
      sounds.playClick();
      this.currentAttempt = 2;
      this.updateAttemptBadge();
      this.hintAlertBox.style.display = 'none';
      this.userDirectInput.value = "";
      this.enableAnswerInputs();
      this.userDirectInput.focus();
    });

    // Next Question
    this.btnNextQuestion.addEventListener('click', () => {
      sounds.playClick();
      this.advanceQuestion();
    });

    // Stage Result Navigation
    this.btnContinueNextStage.addEventListener('click', () => {
      sounds.playClick();
      if (this.currentStage < CONFIG.TOTAL_STAGES) {
        this.startStage(this.currentStage + 1);
      } else {
        this.showFinalSummary();
      }
    });

    this.btnBackToMapFromPass.addEventListener('click', () => {
      sounds.playClick();
      this.updateMapState();
      this.showScreen('map');
    });

    this.btnReplayStage.addEventListener('click', () => {
      sounds.playClick();
      this.startStage(this.currentStage); // รีเซ็ตโจทย์ชุดใหม่ ด่านเดิม
    });

    this.btnBackToMapFromFail.addEventListener('click', () => {
      sounds.playClick();
      this.updateMapState();
      this.showScreen('map');
    });

    // Final Summary Actions
    this.btnPlayAgain.addEventListener('click', () => {
      sounds.playClick();
      this.resetGame();
    });

    this.btnPrintCert.addEventListener('click', () => {
      window.print();
    });

    this.btnToggleReview.addEventListener('click', () => {
      const isHidden = this.reviewAnswersList.style.display === 'none';
      this.reviewAnswersList.style.display = isHidden ? 'flex' : 'none';
      this.btnToggleReview.querySelector('span:last-child').textContent = isHidden ? '▲' : '▼';
    });

    this.btnRetrySync.addEventListener('click', () => {
      this.syncCurrentGame();
    });

    // Help Modal
    this.btnHelp.addEventListener('click', () => {
      sounds.playClick();
      this.modalHelp.style.display = 'flex';
    });
    this.btnCloseHelp.addEventListener('click', () => {
      sounds.playClick();
      this.modalHelp.style.display = 'none';
    });
    this.btnDismissHelp.addEventListener('click', () => {
      sounds.playClick();
      this.modalHelp.style.display = 'none';
    });

    // Header Home
    this.btnHome.addEventListener('click', () => {
      sounds.playClick();
      if (this.player.nickname) {
        this.updateMapState();
        this.showScreen('map');
      } else {
        this.showScreen('welcome');
      }
    });
  }

  // ระบบกระดาษทดเลข (Scratchpad Canvas)
  initScratchpad() {
    this.btnToggleScratchpad.addEventListener('click', () => {
      sounds.playClick();
      const isVisible = this.scratchpadPanel.style.display !== 'none';
      this.scratchpadPanel.style.display = isVisible ? 'none' : 'block';
    });

    this.btnCloseScratchpad.addEventListener('click', () => {
      sounds.playClick();
      this.scratchpadPanel.style.display = 'none';
    });

    const canvas = this.scratchCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * (window.devicePixelRatio || 1);
      canvas.height = 200 * (window.devicePixelRatio || 1);
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#0284c7';
    };

    window.addEventListener('resize', resizeCanvas);
    setTimeout(resizeCanvas, 100);

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const startDraw = (e) => {
      isDrawing = true;
      const pos = getPos(e);
      lastX = pos.x;
      lastY = pos.y;
    };

    const draw = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastX = pos.x;
      lastY = pos.y;
    };

    const stopDraw = () => {
      isDrawing = false;
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);

    this.btnClearScratchpad.addEventListener('click', () => {
      sounds.playClick();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
  }

  handleRegistration() {
    const rawNick = this.inputNickname.value.trim();
    if (!rawNick) {
      alert("กรุณากรอกชื่อเล่นหรือฉายานักสำรวจก่อนเริ่มการผจญภัยนะ!");
      this.inputNickname.focus();
      return;
    }

    const selectedGrade = document.querySelector('input[name="gradeSelect"]:checked').value;
    this.player.nickname = rawNick;
    this.player.grade = selectedGrade;

    sounds.playClick();

    // แสดงข้อมูลใน Top Bar
    this.navPlayerName.textContent = this.player.nickname;
    this.navPlayerGrade.textContent = this.player.grade;
    this.headerPlayerInfo.style.display = 'flex';

    this.updateMapState();
    this.showScreen('map');
  }

  updateMapState() {
    const totalScore = this.stageScores[1] + this.stageScores[2] + this.stageScores[3];
    this.navTotalScore.textContent = totalScore;

    let passedCount = 0;
    if (this.stagePassed[1]) passedCount++;
    if (this.stagePassed[2]) passedCount++;
    if (this.stagePassed[3]) passedCount++;
    this.mapProgressCount.textContent = passedCount;

    // Stage 1
    if (this.stagePassed[1]) {
      this.stationStage1.className = 'stage-station stage-completed';
      this.badgeStage1Score.textContent = `ผ่านแล้ว (${this.stageScores[1]}/50)`;
    } else {
      this.stationStage1.className = 'stage-station stage-unlocked';
      this.badgeStage1Score.textContent = this.stageScores[1] > 0 ? `ยังไม่ผ่าน (${this.stageScores[1]}/50)` : "ยังไม่เล่น";
    }

    // Stage 2: ปลดล็อกเมื่อผ่านด่าน 1
    if (this.stagePassed[1]) {
      this.stationStage2.classList.remove('stage-locked');
      this.stationStage2.classList.add('stage-unlocked');
      this.btnEnterStage2.disabled = false;
      this.btnEnterStage2.innerHTML = `<span>เริ่มสำรวจ</span> ➔`;

      if (this.stagePassed[2]) {
        this.stationStage2.className = 'stage-station stage-completed';
        this.badgeStage2Score.textContent = `ผ่านแล้ว (${this.stageScores[2]}/50)`;
      } else {
        this.badgeStage2Score.textContent = this.stageScores[2] > 0 ? `ยังไม่ผ่าน (${this.stageScores[2]}/50)` : "ปลดล็อกแล้ว";
      }
    } else {
      this.stationStage2.className = 'stage-station stage-locked';
      this.btnEnterStage2.disabled = true;
      this.btnEnterStage2.innerHTML = `<span>ล็อกอยู่</span> 🔒`;
      this.badgeStage2Score.textContent = "🔒 ต้องผ่านด่าน 1 ก่อน";
    }

    // Stage 3: ปลดล็อกเมื่อผ่านด่าน 2
    if (this.stagePassed[2]) {
      this.stationStage3.classList.remove('stage-locked');
      this.stationStage3.classList.add('stage-unlocked');
      this.btnEnterStage3.disabled = false;
      this.btnEnterStage3.innerHTML = `<span>เริ่มสำรวจ</span> ➔`;

      if (this.stagePassed[3]) {
        this.stationStage3.className = 'stage-station stage-completed';
        this.badgeStage3Score.textContent = `ผ่านแล้ว (${this.stageScores[3]}/50)`;
      } else {
        this.badgeStage3Score.textContent = this.stageScores[3] > 0 ? `ยังไม่ผ่าน (${this.stageScores[3]}/50)` : "ปลดล็อกแล้ว";
      }
    } else {
      this.stationStage3.className = 'stage-station stage-locked';
      this.btnEnterStage3.disabled = true;
      this.btnEnterStage3.innerHTML = `<span>ล็อกอยู่</span> 🔒`;
      this.badgeStage3Score.textContent = "🔒 ต้องผ่านด่าน 2 ก่อน";
    }

    // ข้อความแนะนำ
    if (!this.stagePassed[1]) {
      this.mapGuideText.textContent = "เริ่มต้นผจญภัยที่ 'ป่าบวกเลข' ทำคะแนนให้ได้ 30 จาก 50 เพื่อเปิดทางไปถ้ำลบเลข!";
    } else if (!this.stagePassed[2]) {
      this.mapGuideText.textContent = "เก่งมาก! มุ่งหน้าสู่ 'ถ้ำลบเลข' พิชิตการลบทศนิยม 1–2 ตำแหน่งให้ผ่านฉลุย";
    } else if (!this.stagePassed[3]) {
      this.mapGuideText.textContent = "ด่านสุดท้าย 'ปราสาทสมบัติ' รอนักสำรวจผู้กล้าอยู่ พิชิตโจทย์ปัญหาแล้วเปิดหีบทองคำ!";
    } else {
      this.mapGuideText.textContent = "🎉 ยอดเยี่ยม! เธอพิชิตครบทั้ง 3 ด่านแล้ว เข้าสู่หน้าสรุปผลมหาสมบัติได้เลย";
    }
  }

  startStage(stageNum) {
    sounds.playClick();
    this.currentStage = stageNum;
    this.currentQuestionIndex = 0;
    this.stageScores[stageNum] = 0; // ไม่สะสมคะแนนจากการเล่นซ้ำ เริ่มนับรอบใหม่
    this.stageQuestions = QuestionGenerator.generateStageQuestions(stageNum, this.player.grade);

    // อัปเดตข้อมูลหัวด่าน
    const stageNames = ["", "ด่านที่ 1: ป่าบวกเลข", "ด่านที่ 2: ถ้ำลบเลข", "ด่านที่ 3: ปราสาทสมบัติ"];
    const stageIcons = ["", "🌲", "💎", "🏰"];
    const stageTopics = [
      "",
      "บวกทศนิยม 1–2 ตำแหน่ง",
      "ลบทศนิยม 1–2 ตำแหน่ง (ไม่ติดลบ)",
      "บวก–ลบทศนิยมไม่เกิน 3 ตำแหน่ง และโจทย์สถานการณ์"
    ];

    this.gameStageName.textContent = stageNames[stageNum];
    this.gameStageIcon.textContent = stageIcons[stageNum];
    this.gameStageTopic.textContent = stageTopics[stageNum];
    this.gameStageScore.textContent = "0";

    this.showScreen('game');
    this.loadQuestion(0);
  }

  loadQuestion(index) {
    this.currentQuestionIndex = index;
    this.currentQuestion = this.stageQuestions[index];
    this.currentAttempt = 1;

    // ซ่อนกล่อง Feedback เก่า
    this.hintAlertBox.style.display = 'none';
    this.explanationBox.style.display = 'none';
    this.userDirectInput.value = "";

    // ปรับปรุงแถบสถานะ
    this.gameQuestionNumText.textContent = `คำถามข้อที่ ${index + 1} จาก ${CONFIG.QUESTIONS_PER_STAGE} ข้อ`;
    this.gameProgressBar.style.width = `${((index + 1) / CONFIG.QUESTIONS_PER_STAGE) * 100}%`;
    this.updateAttemptBadge();

    this.questionGradeBadge.textContent = `ชั้น ${this.player.grade}`;
    this.questionTypeBadge.textContent = this.currentQuestion.isChoiceType ? "แบบเลือกตอบ 4 ตัวเลือก" : "แบบกรอกคำตอบตัวเลข";

    // แสดงโจทย์
    if (this.currentQuestion.story) {
      this.problemStory.textContent = this.currentQuestion.story;
      this.problemStory.style.display = 'block';
    } else {
      this.problemStory.style.display = 'none';
    }
    this.mathExpression.textContent = this.currentQuestion.expression;

    // สลับโหมดคำตอบ
    if (this.currentQuestion.isChoiceType) {
      this.choicesGrid.style.display = 'grid';
      this.directInputSection.style.display = 'none';
      this.renderChoices(this.currentQuestion.choices);
    } else {
      this.choicesGrid.style.display = 'none';
      this.directInputSection.style.display = 'flex';
      this.enableAnswerInputs();
      setTimeout(() => this.userDirectInput.focus(), 150);
    }
  }

  updateAttemptBadge() {
    if (this.currentAttempt === 1) {
      this.gameAttemptBadge.className = 'attempt-indicator';
      this.gameAttemptBadge.textContent = 'รอบตอบ: ครั้งแรก (10 คะแนน)';
    } else {
      this.gameAttemptBadge.className = 'attempt-indicator attempt-retry';
      this.gameAttemptBadge.textContent = 'รอบตอบ: ครั้งที่ 2 หลังได้คำใบ้ (5 คะแนน)';
    }
  }

  renderChoices(choices) {
    this.choicesGrid.innerHTML = '';
    const letters = ['ก', 'ข', 'ค', 'ง'];

    choices.forEach((choiceVal, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-btn';
      btn.innerHTML = `
        <span class="choice-letter">${letters[idx]}</span>
        <span class="choice-text">${choiceVal}</span>
      `;
      btn.addEventListener('click', () => {
        this.handleAnswerSubmit(choiceVal, btn);
      });
      this.choicesGrid.appendChild(btn);
    });
  }

  enableAnswerInputs() {
    const choiceButtons = this.choicesGrid.querySelectorAll('.choice-btn');
    choiceButtons.forEach(b => {
      b.disabled = false;
      b.classList.remove('selected-correct', 'selected-wrong');
    });
    this.userDirectInput.disabled = false;
    this.btnSubmitDirect.disabled = false;
  }

  disableAnswerInputs() {
    const choiceButtons = this.choicesGrid.querySelectorAll('.choice-btn');
    choiceButtons.forEach(b => b.disabled = true);
    this.userDirectInput.disabled = true;
    this.btnSubmitDirect.disabled = true;
  }

  handleAnswerSubmit(userAns, clickedBtn = null) {
    if (userAns === undefined || userAns === null || String(userAns).trim() === '') {
      alert("กรุณาเลือกหรือกรอกคำตอบก่อนนะ!");
      return;
    }

    const isCorrect = MathPrecision.areEqual(userAns, this.currentQuestion.answer);

    if (isCorrect) {
      // ตอบถูก
      sounds.playCorrect();
      this.disableAnswerInputs();
      if (clickedBtn) clickedBtn.classList.add('selected-correct');

      const pointsEarned = (this.currentAttempt === 1) ? CONFIG.POINTS_FIRST_TRY : CONFIG.POINTS_SECOND_TRY;
      this.stageScores[this.currentStage] += pointsEarned;
      this.gameStageScore.textContent = this.stageScores[this.currentStage];

      if (this.currentAttempt === 1) this.correctFirstTryCount++;
      else this.correctSecondTryCount++;

      // บันทึกคำตอบ
      this.recordAnswerItem(userAns, true, pointsEarned);

      // แสดงเฉลยวิธีตั้งจุดตรงกัน
      this.showExplanation(true, pointsEarned);

    } else {
      // ตอบผิด
      sounds.playWrong();
      if (clickedBtn) clickedBtn.classList.add('selected-wrong');

      if (this.currentAttempt === 1) {
        // ผิดครั้งแรก -> ให้คำใบ้และโอกาสลองใหม่ 1 ครั้ง
        this.disableAnswerInputs();
        this.hintText.textContent = this.currentQuestion.hint || "สังเกตตำแหน่งทศนิยมให้ดีนะ! ตั้งจุดให้ตรงกันแล้วลองคำนวณอีกครั้ง";
        this.hintAlertBox.style.display = 'block';
        // เลื่อนหน้าจอลงมาที่กล่องคำใบ้
        this.hintAlertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      } else {
        // ผิดครั้งที่ 2 -> ได้ 0 คะแนน และแสดงเฉลยอย่างละเอียด
        this.disableAnswerInputs();
        this.mistakeTopics.add(this.currentQuestion.topicTag);
        this.recordAnswerItem(userAns, false, 0);
        this.showExplanation(false, 0);
      }
    }
  }

  recordAnswerItem(userAns, isCorrect, points) {
    this.allAnswersRecord.push({
      sessionId: this.sessionId,
      questionNo: this.allAnswersRecord.length + 1,
      stage: this.currentStage,
      question: this.currentQuestion.expression,
      userAnswer: String(userAns).trim(),
      correctAnswer: String(this.currentQuestion.answer),
      attempt: this.currentAttempt,
      isCorrect: isCorrect,
      points: points,
      topicTag: this.currentQuestion.topicTag
    });
  }

  showExplanation(isCorrect, points) {
    this.hintAlertBox.style.display = 'none';

    if (isCorrect) {
      this.expResultIcon.textContent = '🌟';
      this.expResultTitle.textContent = `ถูกต้องยอดเยี่ยม! (+${points} คะแนน)`;
      this.expResultTitle.style.color = '#15803d';
    } else {
      this.expResultIcon.textContent = '📖';
      this.expResultTitle.textContent = `เฉลยคำตอบที่ถูกต้องคือ ${this.currentQuestion.answer}`;
      this.expResultTitle.style.color = '#c2410c';
    }

    // วาดตารางตั้งหลักเลข
    this.chalkMathContainer.innerHTML = ColumnMathRenderer.render(this.currentQuestion);
    this.chalkRulesGuide.innerHTML = ColumnMathRenderer.renderRules(this.currentQuestion);

    this.explanationBox.style.display = 'block';
    this.explanationBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  advanceQuestion() {
    if (this.currentQuestionIndex + 1 < CONFIG.QUESTIONS_PER_STAGE) {
      this.loadQuestion(this.currentQuestionIndex + 1);
    } else {
      this.handleStageCompletion();
    }
  }

  handleStageCompletion() {
    const finalStageScore = this.stageScores[this.currentStage];
    const isPassed = finalStageScore >= CONFIG.PASS_STAGE_SCORE;

    this.stagePassed[this.currentStage] = isPassed;

    const stageNames = ["", "ด่านที่ 1: ป่าบวกเลข", "ด่านที่ 2: ถ้ำลบเลข", "ด่านที่ 3: ปราสาทสมบัติ"];
    this.showScreen('stageResult');

    if (isPassed) {
      sounds.playStageClear();
      this.passResultView.style.display = 'block';
      this.failResultView.style.display = 'none';

      this.resPassStageName.textContent = stageNames[this.currentStage];
      this.resPassScore.textContent = finalStageScore;

      // คำนวณดาว
      let stars = "⭐⭐⭐";
      if (finalStageScore < 40) stars = "⭐";
      else if (finalStageScore < 50) stars = "⭐⭐";
      this.starsAwarded.textContent = stars;

      if (this.currentStage === CONFIG.TOTAL_STAGES) {
        this.btnContinueNextStage.innerHTML = `<span>👑</span> เปิดหีบมหาสมบัติ (สรุปผลรวม)`;
      } else {
        this.btnContinueNextStage.innerHTML = `<span>🗺️</span> ไปยังด่านที่ ${this.currentStage + 1}`;
      }

    } else {
      sounds.playWrong();
      this.passResultView.style.display = 'none';
      this.failResultView.style.display = 'block';

      this.resFailStageName.textContent = stageNames[this.currentStage];
      this.resFailScore.textContent = finalStageScore;
    }
  }

  showFinalSummary() {
    sounds.playTreasureChest();
    this.showScreen('summary');

    const totalScore = this.stageScores[1] + this.stageScores[2] + this.stageScores[3];
    this.sumPlayerName.textContent = this.player.nickname;
    this.sumPlayerGrade.textContent = `ชั้นประถมศึกษาปีที่ ${this.player.grade.replace('ป.', '')}`;
    this.sumTotalScore.textContent = totalScore;

    // ฉายาตามระดับคะแนน
    let rankTitle = "🏆 มหาราชาแห่งเกาะทศนิยม (ยอดเยี่ยมสูงสุด)";
    if (totalScore < 90) rankTitle = "🧭 นักผจญภัยทศนิยมฝึกหัด";
    else if (totalScore < 120) rankTitle = "⚔️ อัศวินคณิตศาสตร์ผู้กล้าหาญ";
    else if (totalScore < 145) rankTitle = "👑 ยอดกัปตันผู้พิชิตขุมทรัพย์";
    this.sumRankTitle.textContent = rankTitle;

    this.sumStage1Score.textContent = `${this.stageScores[1]} / 50`;
    this.sumStage2Score.textContent = `${this.stageScores[2]} / 50`;
    this.sumStage3Score.textContent = `${this.stageScores[3]} / 50`;

    this.sumFirstTryCount.textContent = this.correctFirstTryCount;
    this.sumSecondTryCount.textContent = this.correctSecondTryCount;

    // หัวข้อที่ควรฝึกเพิ่มเติม
    this.renderImprovementList();

    // รายการประวัติคำตอบทุกข้อ
    this.renderReviewList();

    // ทำการส่งข้อมูลคะแนนไปยัง Google Apps Script
    this.syncCurrentGame();
  }

  renderImprovementList() {
    this.sumImproveList.innerHTML = '';
    const mistakes = Array.from(this.mistakeTopics);

    if (mistakes.length === 0) {
      const li = document.createElement('li');
      li.innerHTML = `🌟 <strong>ยอดเยี่ยมไร้ที่ติ!</strong> เธอทำคะแนนได้แม่นยำทุกหัวข้อ เข้าใจการตั้งจุดทศนิยมและการทด/ยืมอย่างสมบูรณ์แบบ`;
      this.sumImproveList.appendChild(li);
    } else {
      mistakes.forEach(topic => {
        const li = document.createElement('li');
        li.innerHTML = `📌 <strong>${topic}:</strong> ควรฝึกตั้งจุดทศนิยมให้ตรงกัน เติม 0 ในหลักที่แหว่ง และระวังการทดหรือยืม`;
        this.sumImproveList.appendChild(li);
      });
      // แนะนำเพิ่มเติม
      const liGeneral = document.createElement('li');
      liGeneral.innerHTML = `💡 <em>เคล็ดลับเสริม:</em> นำกระดาษทดมาขีดเส้นตั้งจุดทศนิยมเป็นแนวดิ่งก่อนเริ่มคำนวณเสมอ จะช่วยลดข้อผิดพลาดได้มาก`;
      this.sumImproveList.appendChild(liGeneral);
    }
  }

  renderReviewList() {
    this.reviewAnswersList.innerHTML = '';
    this.allAnswersRecord.forEach(item => {
      const div = document.createElement('div');
      div.className = 'review-item';
      div.innerHTML = `
        <div class="review-item-header">
          <span>ด่านที่ ${item.stage} | ข้อที่ ${item.questionNo}</span>
          <span class="${item.isCorrect ? (item.attempt === 1 ? 'review-tag-correct' : 'review-tag-retry') : ''}">
            ${item.isCorrect ? (item.attempt === 1 ? '✅ ถูกครั้งแรก (+10)' : '💡 ถูกครั้งที่ 2 (+5)') : '❌ ผิด (0)'}
          </span>
        </div>
        <div class="review-question">${item.question}</div>
        <div class="review-answers-detail">
          คำตอบของเธอ: <strong>${item.userAnswer}</strong> | เฉลยที่ถูกต้อง: <strong>${item.correctAnswer}</strong> (${item.topicTag})
        </div>
      `;
      this.reviewAnswersList.appendChild(div);
    });
  }

  syncCurrentGame() {
    const totalScore = this.stageScores[1] + this.stageScores[2] + this.stageScores[3];
    const payload = {
      action: "saveGame",
      sessionId: this.sessionId,
      player: {
        playerId: this.player.playerId,
        nickname: this.player.nickname,
        grade: this.player.grade,
        createdAt: this.player.createdAt
      },
      result: {
        sessionId: this.sessionId,
        playerId: this.player.playerId,
        score: totalScore,
        totalQuestions: this.allAnswersRecord.length,
        correctFirstTry: this.correctFirstTryCount,
        completedAt: new Date().toISOString()
      },
      answers: this.allAnswersRecord
    };

    DatabaseSync.submitGameResults(payload, (statusObj) => {
      if (statusObj.status === 'success') {
        this.dbStatusIcon.textContent = '✅';
        this.dbStatusTitle.textContent = statusObj.message;
        this.dbStatusSub.textContent = `รหัสเซสชัน: ${this.sessionId} (บันทึกครบทั้ง 3 ตารางแล้ว)`;
        this.btnRetrySync.style.display = 'none';
      } else if (statusObj.status === 'sending') {
        this.dbStatusIcon.textContent = '⏳';
        this.dbStatusTitle.textContent = statusObj.message;
        this.dbStatusSub.textContent = 'กำลังเชื่อมโยงข้อมูลกับระบบ Google Sheets...';
        this.btnRetrySync.style.display = 'none';
      } else {
        this.dbStatusIcon.textContent = '⚠️';
        this.dbStatusTitle.textContent = 'ยังไม่สามารถส่งคะแนนขึ้นชีตได้ในขณะนี้';
        this.dbStatusSub.textContent = statusObj.message;
        this.btnRetrySync.style.display = 'inline-flex';
      }
    });
  }

  resetGame() {
    this.sessionId = "sess_" + Date.now();
    this.currentStage = 1;
    this.stageScores = { 1: 0, 2: 0, 3: 0 };
    this.stagePassed = { 1: false, 2: false, 3: false };
    this.allAnswersRecord = [];
    this.correctFirstTryCount = 0;
    this.correctSecondTryCount = 0;
    this.mistakeTopics.clear();

    this.updateMapState();
    this.showScreen('map');
  }
}

// =========================================================================
// 8. เริ่มต้นทำงานเมื่อเอกสารโหลดเสร็จสมบูรณ์
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  window.game = new GameController();
});
