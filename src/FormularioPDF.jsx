import React, { useState, useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import LZString from 'lz-string';
import 'bootstrap/dist/css/bootstrap.min.css';

// Función para sanitizar inputs y evitar inyección
const sanitize = (str) => {
  if (!str) return '';
  return str.replace(/[<>]/g, '').trim();
};

// Función segura y universal para leer variables de la URL (compatible con navegadores antiguos)
const getQueryParam = (param) => {
  const query = window.location.search.substring(1);
  const vars = query.split("&");
  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split("=");
    if (pair[0] === param) {
      return decodeURIComponent(pair[1] || "");
    }
  }
  return null;
};

const FormularioPDF = () => {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState('manual');
  
  const [formData, setFormData] = useState({
    nombre: '',
    direccion: '',
    correo: '',
    telefono: '',
    ubicacion: '',
    fecha: '',
    voluntariado: '',
    otroVoluntariado: '',
    // Campos manuales para el representante (opcionales)
    nombreRepresentante: '',
    telefonoRepresentante: '',
    correoRepresentante: '',
    firmaData: null
  });
  
  const [validated, setValidated] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const sigCanvas = useRef(null);

  useEffect(() => {
    // Determinar el modo según la URL (hash o query params, o terminación)
    const url = window.location.href.toLowerCase();
    let currentMode = 'manual';
    
    if (url.endsWith('ppc') || url.includes('?ppc') || url.includes('#ppc') || url.includes('?id=ppc') || url.includes('?ref=ppc') || url.includes('&ref=ppc')) {
      currentMode = 'ppc';
    } else if (url.endsWith('pp') || url.includes('?pp') || url.includes('#pp') || url.includes('?id=pp') || url.includes('?ref=pp') || url.includes('&ref=pp')) {
      currentMode = 'pp';
    }
    setMode(currentMode);

    const data = getQueryParam('data');
    if (data) {
      try {
        const decompressed = LZString.decompressFromEncodedURIComponent(data);
        if (decompressed) {
          const parsed = JSON.parse(decompressed);
          
          // Reconstruir la firma comprimida (si existe)
          let reconstructedFirma = null;
          if (parsed.firmaComp) {
            reconstructedFirma = parsed.firmaComp.map(stroke => ({
              color: stroke.c || "#001999",
              points: stroke.p.map(pt => ({ x: pt[0], y: pt[1], time: Date.now() }))
            }));
            parsed.firmaData = reconstructedFirma;
          }

          // Merge para evitar campos undefined
          setFormData(prev => ({...prev, ...parsed}));
          
          if (parsed.firmaData && sigCanvas.current) {
            setTimeout(() => {
              sigCanvas.current.fromData(parsed.firmaData);
            }, 100);
          }
        }
      } catch (e) {
        console.error("Failed to parse URL data");
      }
    }
  }, [step]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSignatureEnd = () => {
    if (sigCanvas.current) {
      setFormData(prev => ({
        ...prev,
        firmaData: sigCanvas.current.toData()
      }));
    }
  };

  const clearSignature = () => {
    if (sigCanvas.current) {
      sigCanvas.current.clear();
      setFormData(prev => ({ ...prev, firmaData: null }));
    }
  };

  const handleCopyLink = () => {
    try {
      const currentFirmaData = sigCanvas.current && !sigCanvas.current.isEmpty() 
        ? sigCanvas.current.toData() 
        : null;
        
      let firmaComprimida = null;
      if (currentFirmaData && Array.isArray(currentFirmaData)) {
        firmaComprimida = currentFirmaData.map(stroke => ({
          c: stroke.penColor || stroke.color || "#001999",
          p: (stroke.points || [])
            .filter((_, i) => i % 2 === 0)
            .map(pt => [Math.round(pt.x || 0), Math.round(pt.y || 0)])
        }));
      }

      const safeData = { 
        nombre: sanitize(formData.nombre),
        direccion: sanitize(formData.direccion),
        correo: sanitize(formData.correo),
        telefono: sanitize(formData.telefono),
        ubicacion: sanitize(formData.ubicacion),
        fecha: sanitize(formData.fecha),
        voluntariado: sanitize(formData.voluntariado),
        otroVoluntariado: sanitize(formData.otroVoluntariado),
        nombreRepresentante: sanitize(formData.nombreRepresentante),
        telefonoRepresentante: sanitize(formData.telefonoRepresentante),
        correoRepresentante: sanitize(formData.correoRepresentante),
        firmaComp: firmaComprimida
      };
      
      const compressedData = LZString.compressToEncodedURIComponent(JSON.stringify(safeData));
      
      let baseUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      let url = baseUrl + "?data=" + compressedData;
      if (mode === 'ppc') url += "&ref=ppc";
      else if (mode === 'pp') url += "&ref=pp";
      
      const onSuccess = () => {
        setToastMessage('Enlace copiado al portapapeles');
        setTimeout(() => setToastMessage(''), 3000);
      };

      const onError = (err) => {
        console.error('Error al copiar el enlace:', err);
        alert("Tu navegador bloqueó el copiado automático. Por favor, descarga el PDF directamente.");
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(onSuccess).catch(err => {
          fallbackCopy(url, onSuccess, onError);
        });
      } else {
        fallbackCopy(url, onSuccess, onError);
      }
    } catch (e) {
      console.error("Critical error in copy link:", e);
      alert("Ocurrió un error inesperado al procesar el enlace. Intenta vaciar y volver a hacer la firma.");
    }
  };

  const fallbackCopy = (text, onSuccess, onError) => {
    let textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      if (document.execCommand('copy')) {
        onSuccess();
      } else {
        onError();
      }
    } catch (err) {
      onError(err);
    }
    textArea.remove();
  };

  const fillPDF = async () => {
    try {
      const url = 'OMSE%202026.pdf';
      const existingPdfBytes = await fetch(url).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      
      const form = pdfDoc.getForm();
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      
      const blueColor = rgb(0, 0.1, 0.6);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const drawFieldText = (fieldName, text) => {
        if (!text) return;
        const safeText = sanitize(text);
        try {
          const field = form.getTextField(fieldName);
          const widgets = field.acroField.getWidgets();
          if (widgets.length > 0) {
            const rect = widgets[0].getRectangle();
            
            // Lógica de auto-ajuste de tamaño de letra (responsive text size)
            let fontSize = 11;
            let textWidth = font.widthOfTextAtSize(safeText, fontSize);
            while (textWidth > (rect.width - 4) && fontSize > 5) {
              fontSize -= 0.5;
              textWidth = font.widthOfTextAtSize(safeText, fontSize);
            }

            firstPage.drawText(safeText, {
              x: rect.x + 2,
              y: rect.y + (rect.height / 2) - (fontSize / 2.5), // Centrado vertical dinámico
              size: fontSize,
              font: font,
              color: blueColor
            });
            field.setText('');
          }
        } catch(e) {
          console.warn(`Could not draw ${fieldName}`);
        }
      };

      const drawCheckbox = (fieldName) => {
        try {
          const field = form.getCheckBox(fieldName);
          const widgets = field.acroField.getWidgets();
          if (widgets.length > 0) {
            const rect = widgets[0].getRectangle();
            firstPage.drawText('X', {
              x: rect.x + 2,
              y: rect.y + 2,
              size: 10,
              color: blueColor
            });
          }
        } catch(e) {
          console.warn(`Could not draw checkbox ${fieldName}`);
        }
      };

      let formattedDate = sanitize(formData.fecha);
      if (formattedDate) {
        const parts = formattedDate.split('-');
        if (parts.length === 3) {
          formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }

      drawFieldText('Nombre de la persona llamada', formData.nombre);
      drawFieldText('Dirección postal', formData.direccion);
      drawFieldText('Dirección de correo electrónico', formData.correo);
      drawFieldText('Teléfono con código de área', formData.telefono);
      drawFieldText('Ubicación del voluntariado por ejemplo barrio o estaca', formData.ubicacion);
      drawFieldText('Fecha de la orientación', formattedDate);

      // Data de Representante dependiendo del modo
      let repName = formData.nombreRepresentante;
      let repPhone = formData.telefonoRepresentante;
      let repEmail = formData.correoRepresentante;

      if (mode === 'ppc') {
        repName = 'Raúl Enrique León Elias';
        repPhone = '969 337 257';
        repEmail = 'leonre@churchofjesuschrist.org';
      } else if (mode === 'pp') {
        repName = 'Roger Michael Ramirez Tolero';
        repPhone = '965 379 512';
        repEmail = 'ramirezrm@ChurchofJesusChrist.org';
      }

      drawFieldText('Nombre del representante autorizado de seminarios e institutos', repName);
      drawFieldText('Teléfono con código de área_2', repPhone);
      drawFieldText('Dirección de correo electrónico_2', repEmail);

      const safeVoluntariado = sanitize(formData.voluntariado);
      if (safeVoluntariado === 'Maestro de seminario') drawCheckbox('Maestro de seminario');
      else if (safeVoluntariado === 'Maestro de instituto') drawCheckbox('Maestro de instituto');
      else if (safeVoluntariado === 'Supervisor de estaca') drawCheckbox('Supervisor de estaca');
      else if (safeVoluntariado === 'Otro') {
        drawCheckbox('Otro');
        drawFieldText('undefined', formData.otroVoluntariado);
      }

      // Manual trimming function to perfectly crop white space
      const trimCanvas = (canvas) => {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const width = canvas.width;
        const height = canvas.height;
        const pixels = ctx.getImageData(0, 0, width, height);
        const l = pixels.data.length;
        let bound = { top: null, left: null, right: null, bottom: null };
        let x, y;
        
        for (let i = 0; i < l; i += 4) {
          if (pixels.data[i + 3] !== 0) { // If pixel is not transparent
            x = (i / 4) % width;
            y = ~~((i / 4) / width);
            if (bound.top === null) bound.top = y;
            if (bound.left === null) bound.left = x;
            else if (x < bound.left) bound.left = x;
            if (bound.right === null) bound.right = x;
            else if (bound.right < x) bound.right = x;
            if (bound.bottom === null) bound.bottom = y;
            else if (bound.bottom < y) bound.bottom = y;
          }
        }
        
        if (bound.top === null) return canvas;
        
        const padding = 10;
        bound.top = Math.max(0, bound.top - padding);
        bound.left = Math.max(0, bound.left - padding);
        bound.bottom = Math.min(height, bound.bottom + padding);
        bound.right = Math.min(width, bound.right + padding);
        
        const trimHeight = bound.bottom - bound.top;
        const trimWidth = bound.right - bound.left;
        const trimmed = ctx.getImageData(bound.left, bound.top, trimWidth, trimHeight);
        
        const copy = document.createElement('canvas');
        copy.width = trimWidth;
        copy.height = trimHeight;
        copy.getContext('2d').putImageData(trimmed, 0, 0);
        return copy;
      };

      if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
        const originalCanvas = sigCanvas.current.getCanvas();
        const croppedCanvas = trimCanvas(originalCanvas);
        const sigImage = croppedCanvas.toDataURL('image/png');
        
        const base64Data = sigImage.split(',')[1];
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const pngImageBytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          pngImageBytes[i] = binaryString.charCodeAt(i);
        }
        
        const pngImage = await pdfDoc.embedPng(pngImageBytes);
        
        let sigX = 343.8;
        let sigY = 153.6;
        let sigWidth = 186.6;
        
        try {
          const sigField = form.getTextField('Firma del maestro o supervisor de estaca');
          const widgets = sigField.acroField.getWidgets();
          if (widgets.length > 0) {
            const rect = widgets[0].getRectangle();
            sigX = rect.x;
            sigY = rect.y;
            sigWidth = rect.width;
            sigField.setText('');
          }
        } catch (e) {
          console.warn("No se pudo encontrar el campo de firma");
        }

        const pngDims = pngImage.scale(1);
        const ratio = pngDims.width / pngDims.height;
        const drawHeight = 40;
        const drawWidth = drawHeight * ratio;
        
        firstPage.drawImage(pngImage, {
          x: sigX + (sigWidth / 2) - (drawWidth / 2),
          y: sigY - 15,
          width: drawWidth,
          height: drawHeight,
        });
      }

      form.flatten();

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `OMSE_Completado_${sanitize(formData.nombre).replace(/\s+/g, '_') || 'Voluntario'}.pdf`;
      link.click();
      
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Hubo un error al generar el PDF.");
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    
    if (form.checkValidity() === false || (sigCanvas.current && sigCanvas.current.isEmpty())) {
      event.stopPropagation();
      setValidated(true);
      if (sigCanvas.current && sigCanvas.current.isEmpty()) {
        alert("Por favor, agregue su firma.");
      }
      return;
    }
    
    setValidated(true);
    fillPDF();
  };

  return (
    <div className="container py-5">
      {toastMessage && (
        <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 11 }}>
          <div className="toast show align-items-center text-white bg-success border-0" role="alert">
            <div className="d-flex">
              <div className="toast-body">
                {toastMessage}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: CONTEXTO INICIAL */}
      {step === 1 && (
        <div className="row justify-content-center">
          <div className="col-lg-10 col-md-12">
            <div className="card shadow-lg border-0 rounded-4 mb-4">
              <div className="card-body p-4 p-md-5">
                
                <div className="text-center mb-5">
                  <h6 className="text-muted text-uppercase letter-spacing-1 mb-2">La Iglesia de Jesucristo de los Santos de los Últimos Días</h6>
                  <h6 className="text-muted text-uppercase mb-4">Seminarios e Institutos de Religión</h6>
                  <h2 className="fw-bold text-primary">Orientación para maestros y supervisores voluntarios de seminario e instituto de estaca</h2>
                </div>
                
                <h5 className="text-primary border-bottom pb-2 fw-semibold">Para alcanzar nuestro propósito:</h5>
                <p className="text-secondary">Nuestro propósito es ayudar a los hombres y mujeres jóvenes, y a los jóvenes adultos, a entender y confiar en las enseñanzas y en la expiación de Jesucristo, a hacerse merecedores de las bendiciones del templo y a prepararse ellos mismos, a su familia y a los demás para la vida eterna con su Padre Celestial.</p>
                
                <p className="text-secondary"><strong className="text-dark">Vivir.</strong> Vivimos el evangelio de Jesucristo y nos esforzamos por tener la compañía del Espíritu. Nuestra conducta y nuestro trato son ejemplares en el hogar, en el salón de clases y en la comunidad. Procuramos mejorar continuamente nuestro desempeño, nuestro conocimiento, nuestra actitud y nuestro carácter.</p>
                <p className="text-secondary"><strong className="text-dark">Enseñar.</strong> Enseñamos a los alumnos las doctrinas y los principios del Evangelio como se hallan en las Escrituras y en las palabras de los profetas. Estas doctrinas y principios se enseñan de tal manera que conduzcan al entendimiento y a la edificación. Ayudamos a los alumnos a cumplir con su función en el proceso de aprendizaje y los preparamos para que enseñen el Evangelio a los demás.</p>
                <p className="text-secondary"><strong className="text-dark">Administrar.</strong> Administramos nuestros programas y recursos de manera apropiada. Nuestros esfuerzos ayudan a los padres en su responsabilidad de fortalecer a sus familias. Trabajamos estrechamente con los líderes del sacerdocio al invitar a los alumnos a participar y al proveerles de un ambiente espiritual donde ellos puedan relacionarse el uno con el otro y aprender juntos.</p>
                
                <h5 className="text-primary border-bottom pb-2 mt-5 fw-semibold">Requisitos y responsabilidades del Voluntariado:</h5>
                <h6 className="fw-bold mt-4">Requisitos</h6>
                <p className="text-secondary mb-2">Los maestros y supervisores voluntarios de seminario e instituto:</p>
                <ul className="text-secondary mb-4">
                  <li>Serán dignos de poseer una recomendación para el templo.</li>
                  <li>Se esforzarán por seguir el ejemplo del Salvador en aspectos como la manera de vivir, de enseñar, de vestir y en la apariencia personal.</li>
                  <li>Disfrutarán relacionarse con los jóvenes y estar convencidos de que ellos están ansiosos por aprender el Evangelio.</li>
                  <li>Estarán disponibles para enseñar en el tipo de programa de seminario o instituto al que han sido llamados.</li>
                </ul>

                <h6 className="fw-bold mt-3">Responsabilidades</h6>
                <p className="text-secondary mb-2">Los maestros y supervisores voluntarios de seminario e instituto:</p>
                <ul className="text-secondary">
                  <li>Coordinarán la labor de invitar, matricular, enseñar y retener a los alumnos con los líderes del sacerdocio, los líderes de las organizaciones auxiliares, padres y colegas.</li>
                  <li>Alentarán a los estudiantes a que finalicen el curso de estudio.</li>
                  <li>Prestarán especial atención a los nuevos conversos y a los menos activos (y a los exmisioneros que participen en el programa de instituto).</li>
                  <li>Ayudarán a los alumnos a obtener conocimiento del Salvador mediante el Espíritu.</li>
                  <li>Se prepararán espiritual y académicamente.</li>
                  <li>Enseñarán las doctrinas y los principios del evangelio de Jesucristo como se hallan en las Escrituras y en las palabras de los profetas, valiéndose del material de estudio aprobado.</li>
                  <li>Ayudarán a los alumnos a identificar, entender, explicar y aplicar en su vida esas doctrinas y esos principios.</li>
                  <li>Darán testimonio de las doctrinas y los principios del Evangelio tanto por el precepto como por el ejemplo.</li>
                  <li>Se asegurarán de que los informes de asistencia estén completos, sean exactos y se entreguen a tiempo.</li>
                  <li>Asistirán a las capacitaciones locales y a las reuniones para maestros y supervisores en funciones.</li>
                  <li>Asistirán por invitación a los consejos de barrio y de estaca, a las reuniones de comités de obispado para la juventud y comités de adultos solteros.</li>
                </ul>
                
                <div className="alert alert-info mt-5 bg-light border-start border-4 border-info">
                  <strong className="text-info-emphasis">Voluntariado:</strong> Las actividades que desarrollan los maestros y supervisores de Seminarios e Institutos de Religión corresponden a la prestación voluntaria, libre y altruista de servicios sociales y espirituales, sin ningún tipo de contraprestación económica, en beneficio de la comunidad.
                </div>

                <div className="d-flex justify-content-end mt-5 pt-3 border-top">
                  <button className="btn btn-primary px-5 py-2 fw-bold shadow-sm d-flex align-items-center gap-2" onClick={() => setStep(2)}>
                    Siguiente
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                      <path fillRule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/>
                    </svg>
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: FORMULARIO */}
      {step === 2 && (
        <div className="row justify-content-center">
          <div className="col-lg-10 col-md-12">
            <div className="card shadow-lg border-0 rounded-4">
              <div className="card-header bg-primary text-white py-3 rounded-top-4 d-flex align-items-center gap-3">
                <button className="btn btn-sm btn-light p-1 rounded-circle d-flex align-items-center justify-content-center" style={{width: '32px', height: '32px'}} onClick={() => setStep(1)} title="Volver al contexto">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/>
                  </svg>
                </button>
                <h2 className="mb-0 text-center fw-bold fs-4 flex-grow-1 me-4">Formulario de OMSE</h2>
              </div>
              <div className="card-body p-4 p-md-5">
                <form noValidate className={validated ? 'was-validated' : ''} onSubmit={handleSubmit}>
                  
                  {/* Información Personal */}
                  <h4 className="mb-4 text-primary border-bottom pb-2">Información Personal</h4>
                  <div className="row g-3 mb-4">
                    <div className="col-md-12">
                      <label htmlFor="nombre" className="form-label fw-semibold">Nombre de la persona llamada *</label>
                      <input type="text" className="form-control" id="nombre" name="nombre" value={formData.nombre} onChange={handleChange} required />
                      <div className="invalid-feedback">Por favor ingrese el nombre.</div>
                    </div>
                    <div className="col-md-12">
                      <label htmlFor="direccion" className="form-label fw-semibold">Dirección postal *</label>
                      <input type="text" className="form-control" id="direccion" name="direccion" value={formData.direccion} onChange={handleChange} required />
                      <div className="invalid-feedback">Por favor ingrese la dirección postal.</div>
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="correo" className="form-label fw-semibold">Correo electrónico (Opcional)</label>
                      <input type="email" className="form-control" id="correo" name="correo" value={formData.correo} onChange={handleChange} />
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="telefono" className="form-label fw-semibold">Número de teléfono *</label>
                      <input type="tel" className="form-control" id="telefono" name="telefono" value={formData.telefono} onChange={handleChange} required minLength="9" maxLength="9" pattern="[0-9]{9}" />
                      <div className="invalid-feedback">Por favor ingrese un teléfono válido de 9 dígitos.</div>
                    </div>
                  </div>

                  {/* Detalles del Voluntariado */}
                  <h4 className="mb-4 text-primary border-bottom pb-2">Detalles del Voluntariado</h4>
                  <div className="row g-3 mb-4">
                    <div className="col-md-6">
                      <label htmlFor="ubicacion" className="form-label fw-semibold">Ubicación (Barrio o Estaca) *</label>
                      <input type="text" className="form-control" id="ubicacion" name="ubicacion" value={formData.ubicacion} onChange={handleChange} required />
                      <div className="invalid-feedback">Por favor ingrese la ubicación.</div>
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="fecha" className="form-label fw-semibold">Fecha de orientación *</label>
                      <input type="date" className="form-control" id="fecha" name="fecha" value={formData.fecha} onChange={handleChange} required />
                      <div className="invalid-feedback">Por favor seleccione la fecha.</div>
                    </div>
                    
                    <div className="col-md-12">
                      <label className="form-label fw-semibold d-block">Tipo de voluntariado *</label>
                      <div className="form-check form-check-inline">
                        <input className="form-check-input" type="radio" name="voluntariado" id="volSeminario" value="Maestro de seminario" checked={formData.voluntariado === 'Maestro de seminario'} onChange={handleChange} required />
                        <label className="form-check-label" htmlFor="volSeminario">Maestro de seminario</label>
                      </div>
                      <div className="form-check form-check-inline">
                        <input className="form-check-input" type="radio" name="voluntariado" id="volInstituto" value="Maestro de instituto" checked={formData.voluntariado === 'Maestro de instituto'} onChange={handleChange} required />
                        <label className="form-check-label" htmlFor="volInstituto">Maestro de instituto</label>
                      </div>
                      <div className="form-check form-check-inline">
                        <input className="form-check-input" type="radio" name="voluntariado" id="volSupervisor" value="Supervisor de estaca" checked={formData.voluntariado === 'Supervisor de estaca'} onChange={handleChange} required />
                        <label className="form-check-label" htmlFor="volSupervisor">Supervisor de estaca</label>
                      </div>
                      <div className="form-check form-check-inline">
                        <input className="form-check-input" type="radio" name="voluntariado" id="volOtro" value="Otro" checked={formData.voluntariado === 'Otro'} onChange={handleChange} required />
                        <label className="form-check-label" htmlFor="volOtro">Otro</label>
                      </div>
                      
                      {formData.voluntariado === 'Otro' && (
                        <div className="mt-2">
                          <input type="text" className="form-control" name="otroVoluntariado" placeholder="Especifique el voluntariado" value={formData.otroVoluntariado} onChange={handleChange} required />
                          <div className="invalid-feedback">Por favor especifique.</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Representante Autorizado (Condicional) */}
                  {mode === 'manual' && (
                    <>
                      <h4 className="mb-4 text-primary border-bottom pb-2">Información de Seminarios e Institutos (Opcional)</h4>
                      <div className="row g-3 mb-4">
                        <div className="col-md-12">
                          <label htmlFor="nombreRepresentante" className="form-label fw-semibold">Nombre del representante</label>
                          <input type="text" className="form-control" id="nombreRepresentante" name="nombreRepresentante" value={formData.nombreRepresentante} onChange={handleChange} placeholder="Ej. Juan Pérez" />
                        </div>
                        <div className="col-md-6">
                          <label htmlFor="correoRepresentante" className="form-label fw-semibold">Correo del representante</label>
                          <input type="email" className="form-control" id="correoRepresentante" name="correoRepresentante" value={formData.correoRepresentante} onChange={handleChange} placeholder="Ej. correo@ejemplo.com" />
                        </div>
                        <div className="col-md-6">
                          <label htmlFor="telefonoRepresentante" className="form-label fw-semibold">Teléfono del representante</label>
                          <input type="tel" className="form-control" id="telefonoRepresentante" name="telefonoRepresentante" value={formData.telefonoRepresentante} onChange={handleChange} placeholder="Ej. 999 999 999" />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Firma Digital */}
                  <h4 className="mb-4 text-primary border-bottom pb-2">Firma Digital *</h4>
                  <div className="row g-3 mb-4">
                    <div className="col-md-12">
                      <div className="card border bg-light shadow-sm">
                        <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
                          <span className="text-muted small fw-semibold"><i className="bi bi-pen me-1"></i> Área de firma</span>
                          <button type="button" className="btn btn-sm btn-outline-danger py-1" onClick={clearSignature} title="Limpiar y volver a firmar">
                            <i className="bi bi-eraser-fill"></i> Limpiar
                          </button>
                        </div>
                        <div className="card-body p-0 d-flex justify-content-center bg-white" style={{ borderRadius: '0 0 var(--bs-border-radius) var(--bs-border-radius)' }}>
                          <SignatureCanvas 
                            ref={sigCanvas} 
                            onEnd={handleSignatureEnd}
                            canvasProps={{ 
                              className: 'signature-canvas w-100', 
                              style: { height: '200px', cursor: 'crosshair', touchAction: 'none' } 
                            }} 
                            penColor="#001999"
                          />
                        </div>
                      </div>
                      <small className="text-muted mt-2 d-block">Por favor, firme dentro del recuadro usando su cursor o el dedo en pantallas táctiles.</small>
                    </div>
                  </div>

                  {/* Botones de Acción */}
                  <div className="d-flex justify-content-between align-items-center border-top pt-4 mt-5">
                    <button type="button" className="btn btn-outline-secondary px-4 py-2 fw-semibold shadow-sm" onClick={handleCopyLink}>
                      <i className="bi bi-link-45deg me-1"></i> Copiar Vínculo
                    </button>
                    <button type="submit" className="btn btn-primary px-5 py-2 fw-bold shadow-sm d-flex align-items-center">
                      Descargar PDF <i className="bi bi-file-earmark-pdf-fill ms-2 fs-5"></i>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FormularioPDF;
