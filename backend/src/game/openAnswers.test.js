import assert from "node:assert/strict";
import { isCorrectOpenAnswer as ok, normalizeOpen, editDistance } from "./openAnswers.js";

const q = (answer, extra = {}) => ({ answer, ...extra });

// Normalización
assert.equal(normalizeOpen("  ¡Ciudad   de México! "), "ciudad de mexico");
assert.equal(normalizeOpen("Perú (país)"), "peru");
assert.equal(editDistance("pais", "pasi"), 1); // transposición

// Exacta, acentos, mayúsculas y signos
assert.equal(ok("buenos aires", q("Buenos Aires")), true);
assert.equal(ok("BUENOS AIRES!!", q("Buenos Aires")), true);
assert.equal(ok("bogota", q("Bogotá")), true);
assert.equal(ok("Brasilia", q("Brasília")), true);

// Artículos y conectores no cuentan
assert.equal(ok("la haya", q("La Haya")), true);
assert.equal(ok("haya", q("La Haya")), true);
assert.equal(ok("ciudad mexico", q("Ciudad de México")), true);
assert.equal(ok("el cairo", q("El Cairo")), true);
assert.equal(ok("cairo", q("El Cairo")), true);

// Errores ortográficos pequeños pero idea correcta
assert.equal(ok("buenos airez", q("Buenos Aires")), true);
assert.equal(ok("bunos aires", q("Buenos Aires")), true);
assert.equal(ok("estocolmo", q("Estocolmo")), true);
assert.equal(ok("estocolmoo", q("Estocolmo")), true);
assert.equal(ok("washinton", q("Washington")), true);
assert.equal(ok("canbera", q("Canberra")), true);
assert.equal(ok("budapets", q("Budapest")), true); // transposición
assert.equal(ok("buenosaires", q("Buenos Aires")), true); // sin espacio
assert.equal(ok("aires buenos", q("Buenos Aires")), true); // orden

// Errores demasiado grandes o respuesta distinta
assert.equal(ok("lima", q("Quito")), false);
assert.equal(ok("madrid", q("Lisboa")), false);
assert.equal(ok("buenos", q("Buenos Aires")), false); // incompleta
assert.equal(ok("buenos aires argentina", q("Buenos Aires")), false); // palabras de más
assert.equal(ok("", q("Lima")), false);
assert.equal(ok("   ", q("Lima")), false);

// Palabras cortas: exactas (no se confunde "Chad" con otra cosa)
assert.equal(ok("chas", q("Chad")), false);
assert.equal(ok("rom", q("Roma")), false);
assert.equal(ok("oslo", q("Oslo")), true);

// La inicial no cambia: evita aceptar palabras distintas parecidas
assert.equal(ok("tima", q("Lima")), false);

// Respuestas parecidas que no valen
const niger = q("Níger", { reject: ["nigeria"] });
assert.equal(ok("niger", niger), true);
assert.equal(ok("nigeria", niger), false);
assert.equal(ok("sudan", q("Sudán del Sur")), false);
assert.equal(ok("sudan del sur", q("Sudán del Sur")), true);
assert.equal(ok("sudan del sur", q("Sudán")), false);

// Alias
const usa = q("Estados Unidos", { aliases: ["EEUU", "EE.UU.", "USA", "Estados Unidos de América"] });
assert.equal(ok("eeuu", usa), true);
assert.equal(ok("EE.UU", usa), true);
assert.equal(ok("usa", usa), true);
assert.equal(ok("estados unidos de america", usa), true);
assert.equal(ok("estados unidos", usa), true);
assert.equal(ok("canada", usa), false);

// Números y años: exactos
const year = q("1492");
assert.equal(ok("1492", year), true);
assert.equal(ok(" 1492 ", year), true);
assert.equal(ok("1429", year), false);
assert.equal(ok("1493", year), false);
assert.equal(ok("mil", year), false);
assert.equal(ok("1.000", q("1000")), true);
assert.equal(ok("8849", q("8849", { aliases: ["8848"] })), true);

// Nombres de persona: basta el apellido
const cervantes = q("Miguel de Cervantes", { answerType: "name" });
assert.equal(ok("cervantes", cervantes), true);
assert.equal(ok("zervantes", cervantes), false); // cambia la inicial
assert.equal(ok("cerbantes", cervantes), true);
assert.equal(ok("miguel de cervantes", cervantes), true);
assert.equal(ok("miguel", cervantes), false);
assert.equal(ok("ana", cervantes), false);
assert.equal(ok("cervantes", q("Miguel de Cervantes")), false); // tipo "text" exige todo

// Siglas con o sin puntos y espacios, y palabras juntas
const eeuu = q("Estados Unidos", { aliases: ["EE. UU.", "USA", "EUA"] });
assert.equal(ok("EEUU", eeuu), true);
assert.equal(ok("ee uu", eeuu), true);
assert.equal(ok("EstadosUnidos", eeuu), true);
assert.equal(ok("eua", eeuu), true);
assert.equal(ok("Ganondof", q("Ganondorf")), true); // una letra de menos
assert.equal(ok("GANONDORF", q("Ganondorf")), true);

// Medidas: el número basta, sin la unidad; un número con otras palabras no ("16 de septiembre")
assert.equal(ok("42195", q("42,195 km")), true);
assert.equal(ok("42,195", q("42,195 km")), true);
assert.equal(ok("42", q("42,195 km")), false);
assert.equal(ok("100", q("100 °C")), true);
assert.equal(ok("300000", q("300 000 km/s")), true);
assert.equal(ok("13", q("El 13")), true);
assert.equal(ok("16", q("16 de septiembre")), false);
assert.equal(ok("16 septiembre", q("16 de septiembre")), true);

// Números, romanos y letras sueltas distinguen respuestas: sin margen de error
assert.equal(ok("vitamina c", q("Vitamina D")), false);
assert.equal(ok("vitamina d", q("Vitamina D")), true);
assert.equal(ok("playstation 4", q("PlayStation 5")), false);
assert.equal(ok("luis xvi", q("Luis XIV")), false);
assert.equal(ok("luis xiv", q("Luis XIV")), true);
assert.equal(ok("cada 2 años", q("Cada 4 años")), false);
assert.equal(ok("guerra de los siete años", q("La guerra de los Cien Años")), false);
assert.equal(ok("guera de los cien años", q("La guerra de los Cien Años")), true);

console.log("openAnswers.test ok");
