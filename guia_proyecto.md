# Toma de datos — Comedor (Optimización)


## 1. Idea del sistema

Estudiamos el comedor como **dos rutas en paralelo** (Piso 1 y Piso 2). Un estudiante:

1. Elige un piso (fila que se vea mejor / preferencia).
2. Recibe tiquete → lo entregan/verifican (control de colados; a veces sueltan gente por “pools”).
3. Llega a la **caja** (pago) → ese es el **servidor** que nos importa.
4. Después del pago (plato, jugo, etc.) el flujo suele ser más fluido; **no es el foco del modelo**.

**Qué optimizamos (a grandes rasgos):**  
Con tasas de llegada (tiquetes) y de atención (pagos) por piso, plantear un modelo de **asignación / redes / multiperiodo** para ver si el split actual P1/P2 satura un piso y cómo mejoraría un reparto distinto.

**Qué medimos (solo lo visible, sin molestar la operación):**

| Quién | Dónde | Eventos |
|--------|--------|---------|
| **Rol A** | Entrega de tiquetes (ve ambos pisos) | Tiquete Piso 1, Tiquete Piso 2 |
| **Rol B** | Caja Piso 1 | Inicio de pago → método al cerrar |
| **Rol C** | Caja Piso 2 | Inicio de pago → método al cerrar |

Métodos al registrar el fin: **efectivo**, **tarjeta**, **qr**, **apoyo** (queda en la columna `valor_extra` de `eventos`).

Con eso armamos entradas **Eᵢₜ** (tiquetes al piso *i* en la franja *t*), salidas/throughput **Sᵢₜ** (pagos), tiempos de servicio (inicio − fin) y, si hace falta, mezcla por método de pago.

**Reglas del profesor (no negociables):**
- No interrumpir la operación del comedor.
- No entrevistar/encuestar trabajadores.
- Observación externa; sí se puede hablar con estudiantes si hace falta (sin colarse).
- Guardar evidencias (fotos con hora visible).

---

## 2. Cómo usar la aplicación

**App:** https://nicolasmcort.github.io/comedor-toma-datos/  
**Contraseña del grupo:** `unalcomedor`

Datos → Google Sheets (cuenta del equipo).  
Fotos → Drive, carpeta **`Evidencias Comedor`**.

### Antes de salir
1. Los **3** con celular cargado y la misma hora (automática).
2. Acordar **día, franja** (ej. 12:00–13:00) y quién es A / B / C.
3. Abrir el link, entrar con la contraseña.
4. Elegir **tu nombre** → **tu rol** → pantalla de función.

### Durante la toma (importante)
1. Los **3 deben estar al mismo tiempo** en sus puestos.
2. Casi juntos: pulsar **INICIAR** (ideal: uno cuenta “3, 2, 1” por chat).
3. Solo registrar **tu** rol (botones grandes).
4. Si te equivocas: **Deshacer último**.
5. Tomar **al menos 1–2 evidencias** (foto del lugar con hora/fecha pegada) al inicio y/o al final.
6. Al terminar: los 3 pulsan **DETENER** casi juntos.
7. Revisar el texto verde: **“Todo está en la nube”**. Si hay pendientes y hay red → **Subir pendientes a la nube**.

### Si no hay internet
- Sigue tomando datos igual (se guardan en el celular).
- Luego: **CSV / Excel** y **Descargar evidencias (local)**, o espera red y sube pendientes.

### Después
- Verificar en Sheets que llegaron eventos de A, B y C en el mismo intervalo.
- Para el análisis solo usamos la franja donde **coinciden** los tres (entre el último INICIAR y el primer DETENER).

---

## 3. Checklist de una sesión

- [ ] 3 personas presentes (A, B y C)
- [ ] Misma franja horaria
- [ ] INICIAR casi simultáneo
- [ ] Evidencias con hora
- [ ] DETENER casi simultáneo
- [ ] Datos en la nube (o export local)

---

## 4. Contacto rápido de roles

- **A — Entrada:** cada tiquete que se entrega (P1 o P2).
- **B — Piso 1:** cada pago que empieza / termina en esa caja.
- **C — Piso 2:** igual en la otra caja.

Cualquier duda sobre el modelo o la app, revisar este archivo o preguntar en el grupo antes de improvisar en campo.

---

## 5. Teoría del curso que vamos a aplicar

Con los datos (**Eᵢₜ** = tiquetes, **Sᵢₜ** = pagos, más tiempos de servicio) formulamos un problema de **asignación / flujo entre los dos pisos** en franjas de tiempo, lo resolvemos en Excel Solver / GAMS / Gurobi y analizamos implicaciones.

### Temas del curso que se usan

| Tema | Para qué en este proyecto |
|------|---------------------------|
| **Programación lineal (PL)** | Formular objetivo (p. ej. minimizar congestión / tiempo) y restricciones de capacidad y demanda por franja. |
| **Formulación de modelos** | Variables de decisión (cuántos van a P1 vs P2), FO y restricciones claras. |
| **Programación lineal entera / mixta (PEM)** | Si el flujo se modela en enteros (personas) o hay decisiones 0-1 (activar/capacitar una rama). |
| **Optimización en redes / flujo en redes** | Comedor como red: llegada → bifurcar → Piso 1 / Piso 2 → salida; capacidades en arcos. |
| **Modelos multiperiodo** | Franjas de 5–10 min; balance de personas (entradas − salidas) a lo largo de la hora pico. |
| **Análisis de resultados / sensibilidad** (si aplica) | Qué pasa si cambia la demanda o la capacidad de una caja. |
| **Programación dinámica** *(opcional / refuerzo)* | Etapas = franjas; estado ≈ acumulación en el sistema; política de reparto en el tiempo. |

### Enfoque principal (recomendado)

1. **Redes + PL / PEM multiperiodo:** asignación óptima P1/P2 por franja vs split observado.  
2. Comparar resultado del solver con lo que pasó en la toma de datos.  
3. Conclusiones operativas (sin proponer cosas que no se puedan observar ni que interrumpan el comedor).
