from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from ..database import get_db
from ..models.user import User, UserPlan
from ..models.category import Category
from ..schemas.user import UserResponse, ActivarTrabajadorRequest, ModoActivoRequest
from ..services.auth import get_current_user, get_current_admin
from ..services.user_profile import build_user_response
from ..services.plans import effective_plan, services_daily_limit, is_premium_active, PLAN_GRATIS_RADIO_MAX_KM, PLAN_PREMIUM_RADIO_MAX_KM, PLAN_PREMIUM_ANUNCIOS_DIA

router = APIRouter()

@router.get('/profile', response_model=UserResponse)
def get_profile(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_user_response(db, current_user)

@router.get('/public/{user_id}')
def get_public_worker(user_id: str, db: Session = Depends(get_db)):
    row = (db.query(User, Category.nombre.label('categoria_nombre'), Category.icono.label('categoria_icono'))
           .outerjoin(Category, Category.id == User.categoria_id)
           .filter(User.id == user_id, User.es_trabajador.is_(True), User.suspendido.is_(False)).first())
    if not row:
        raise HTTPException(status_code=404, detail='Trabajador no encontrado')
    u, categoria_nombre, categoria_icono = row
    return {'id': str(u.id), 'nombre': u.nombre, 'foto': u.foto, 'categoria_id': u.categoria_id,
            'categoria_nombre': categoria_nombre, 'categoria_icono': categoria_icono,
            'descripcion_trabajador': u.descripcion_trabajador, 'precio_hora': u.precio_hora,
            'rating': u.rating or 0.0, 'verificado': bool(u.verificado),
            'municipio': u.municipio, 'zona': u.zona}

@router.get('/entitlements')
def get_entitlements(current_user: User = Depends(get_current_user)):
    plan = effective_plan(current_user); premium = is_premium_active(current_user)
    is_professional = plan in (UserPlan.BASE.value, UserPlan.PREMIUM.value)
    return {'plan': plan, 'plan_expira': current_user.plan_expira.isoformat() if current_user.plan_expira else None,
            'es_cliente': bool(current_user.es_cliente), 'es_trabajador': bool(current_user.es_trabajador),
            'can_discover': True, 'can_contact': True, 'can_apply': True,
            'can_publish_need': is_professional, 'can_publish_service': is_professional,
            'services_daily_limit': services_daily_limit(current_user) if is_professional else 0,
            'max_radius_km': PLAN_PREMIUM_RADIO_MAX_KM if premium else PLAN_GRATIS_RADIO_MAX_KM,
            'can_publish_ads': premium, 'ads_daily_limit': PLAN_PREMIUM_ANUNCIOS_DIA if premium else 0,
            'priority_notifications': premium}

@router.put('/activar-trabajador', response_model=UserResponse)
def activar_trabajador(body: ActivarTrabajadorRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    categoria = db.query(Category).filter(Category.id == body.categoria_id, Category.activo.is_(True)).first()
    if not categoria: raise HTTPException(status_code=400, detail='Categoría inválida')
    current_user.es_trabajador=True; current_user.categoria_id=body.categoria_id
    current_user.descripcion_trabajador=body.descripcion_trabajador.strip() if body.descripcion_trabajador else None; current_user.precio_hora=body.precio_hora
    if body.municipio is not None: current_user.municipio=body.municipio.strip() or None
    if body.zona is not None: current_user.zona=body.zona.strip() or None
    if body.lat is not None: current_user.lat=body.lat
    if body.lng is not None: current_user.lng=body.lng
    current_user.modo_activo='trabajador'
    try: db.commit()
    except Exception: db.rollback(); raise
    db.refresh(current_user); return build_user_response(db,current_user)

@router.put('/modo-activo', response_model=UserResponse)
def cambiar_modo_activo(body: ModoActivoRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if body.modo not in ('cliente','trabajador'): raise HTTPException(status_code=400,detail="Modo inválido: debe ser 'cliente' o 'trabajador'")
    if body.modo=='cliente' and not current_user.es_cliente: raise HTTPException(status_code=403,detail='No tienes el perfil de cliente activo')
    if body.modo=='trabajador' and not current_user.es_trabajador: raise HTTPException(status_code=403,detail='Completa tu perfil de trabajador antes de activar este modo')
    current_user.modo_activo=body.modo
    try: db.commit()
    except Exception: db.rollback(); raise
    db.refresh(current_user); return build_user_response(db,current_user)

@router.get('/stats/workers-count')
def workers_count(db: Session = Depends(get_db)):
    base_filter=(User.es_trabajador.is_(True),User.suspendido.is_(False),User.categoria_id.isnot(None)); total=db.query(User.id).filter(*base_filter).count()
    rows=db.query(User.categoria_id,func.count(User.id)).filter(*base_filter).group_by(User.categoria_id).all()
    return {'total':total,'por_categoria':{str(cat_id):count for cat_id,count in rows}}

@router.get('/admin/list')
def list_users_admin(q: Optional[str]=None,db: Session=Depends(get_db),_admin: User=Depends(get_current_admin)):
    query=db.query(User)
    if q:
        like=f'%{q}%'; query=query.filter((User.nombre.ilike(like)) | (User.telefono.ilike(like)))
    users=query.order_by(User.created_at.desc()).limit(200).all()
    return [{'id':str(u.id),'nombre':u.nombre,'telefono':u.telefono,'es_cliente':u.es_cliente,'es_trabajador':u.es_trabajador,'es_admin':u.es_admin,'verificado':u.verificado,'plan':effective_plan(u),'rating':u.rating or 0.0,'categoria_id':u.categoria_id,'created_at':u.created_at.isoformat() if u.created_at else None} for u in users]

@router.post('/admin/{user_id}/toggle-verificado')
def toggle_verificado_admin(user_id:str,db:Session=Depends(get_db),_admin:User=Depends(get_current_admin)):
    user=db.query(User).filter(User.id==user_id).first()
    if not user: raise HTTPException(status_code=404,detail='Usuario no encontrado')
    user.verificado=not user.verificado; db.commit(); return {'id':str(user.id),'verificado':user.verificado}
