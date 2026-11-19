import { ArrowLeft, ShieldCheck } from 'lucide-react';

interface LegalPageProps {
  kind: 'privacidad' | 'terminos';
  onBack: () => void;
}

export function LegalPage({ kind, onBack }: LegalPageProps) {
  const isPrivacy = kind === 'privacidad';

  return (
    <div className="min-h-[100dvh] bg-slate-50 text-slate-900 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {isPrivacy
                  ? 'Política de Privacidad — EL FACHA CELULARES'
                  : 'Términos de Uso — EL FACHA CELULARES'}
              </h1>
              <p className="text-xs text-slate-500">Última actualización: 19 de noviembre de 2026</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al sistema</span>
          </button>
        </div>

        {isPrivacy ? (
          <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
            <p>
              En <strong>EL FACHA CELULARES - Sistema de Gestión</strong> protegemos la información
              de tu negocio. Esta política explica qué datos utilizamos y con qué finalidad.
            </p>
            <div>
              <h2 className="font-bold text-slate-900 mb-1">
                1. Datos recopilados mediante Google Sign-In
              </h2>
              <p>
                Solo solicitamos acceso a tu correo electrónico, nombre visible y foto de perfil
                para identificar tu sesión y aislar tus datos comerciales en Cloud Firestore. No
                accedemos a contactos, archivos de Drive, correos ni calendarios.
              </p>
            </div>
            <div>
              <h2 className="font-bold text-slate-900 mb-1">
                2. Uso de datos del negocio y cámara
              </h2>
              <p>
                Los productos, reparaciones y ventas se almacenan exclusivamente para tu cuenta. El
                acceso a la cámara se usa localmente en tiempo real para leer códigos de barras y
                nunca graba ni sube video a servidores externos.
              </p>
            </div>
            <div>
              <h2 className="font-bold text-slate-900 mb-1">3. Contacto y eliminación de datos</h2>
              <p>
                Podés exportar tus datos en JSON/Excel en cualquier momento. Para solicitar la
                eliminación de tu cuenta y sus registros, escribí a{' '}
                <strong>jo4quinpalavecino@gmail.com</strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
            <div>
              <h2 className="font-bold text-slate-900 mb-1">1. Alcance del sistema</h2>
              <p>
                <strong>EL FACHA CELULARES - Sistema de Gestión</strong> es una plataforma web para
                control de inventario, punto de venta, escaneo de códigos y servicio técnico.
              </p>
            </div>
            <div>
              <h2 className="font-bold text-slate-900 mb-1">2. Respaldo y uso responsable</h2>
              <p>
                Cada usuario es responsable de los precios, movimientos y copias de respaldo
                realizadas en su cuenta.
              </p>
            </div>
            <div>
              <h2 className="font-bold text-slate-900 mb-1">3. Soporte</h2>
              <p>
                Contacto de soporte técnico: <strong>jo4quinpalavecino@gmail.com</strong>.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
