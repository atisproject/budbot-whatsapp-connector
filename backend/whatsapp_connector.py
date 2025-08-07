from flask import Blueprint, request, jsonify
from backend.extensions import db
from backend.models import Lead, Message
from loguru import logger
from datetime import datetime
import json
import os

whatsapp_connector_bp = Blueprint('whatsapp_connector', __name__)

@whatsapp_connector_bp.route('/connector', methods=['POST'])
def handle_connector_webhook():
    """Handle WhatsApp connector events"""
    try:
        data = request.get_json()
        logger.info(f"📡 Received connector event: {data.get('event', 'unknown')}")
        
        # Verify token
        token = data.get('token') or request.headers.get('Authorization', '').replace('Bearer ', '')
        expected_token = os.environ.get('WEBHOOK_TOKEN', 'budbot_webhook_secret_2025')
        
        if not token or token != expected_token:
            logger.warning("❌ Invalid connector token")
            return jsonify({"error": "Invalid token"}), 403
        
        event = data.get('event')
        event_data = data.get('data', {})
        
        # Handle different event types
        if event == 'qr_generated':
            logger.info("✅ QR Code gerado pelo connector")
            return jsonify({"status": "ok", "message": "QR code received"})
            
        elif event == 'client_ready':
            logger.info(f"✅ Cliente WhatsApp conectado: {event_data}")
            return jsonify({"status": "ok", "message": "Client ready"})
            
        elif event == 'message_received':
            return process_connector_message(event_data)
            
        elif event == 'authenticated':
            logger.info("✅ Cliente WhatsApp autenticado")
            return jsonify({"status": "ok", "message": "Authenticated"})
            
        elif event == 'disconnected':
            logger.info(f"⚠️ Cliente WhatsApp desconectado: {event_data}")
            return jsonify({"status": "ok", "message": "Disconnected"})
            
        else:
            logger.warning(f"❓ Evento desconhecido: {event}")
            return jsonify({"status": "ok", "message": "Unknown event"})
        
    except Exception as e:
        logger.error(f"❌ Erro processando webhook do connector: {str(e)}")
        return jsonify({"error": str(e)}), 500

def process_connector_message(message_data):
    """Process a message from WhatsApp connector"""
    try:
        from_number = message_data.get('from', '').replace('@c.us', '')
        contact_info = message_data.get('contact', {})
        contact_name = contact_info.get('name', 'Usuário')
        message_body = message_data.get('body', '')
        timestamp = datetime.fromtimestamp(message_data.get('timestamp', 0))
        
        logger.info(f"📨 Processando mensagem de {contact_name} ({from_number}): {message_body[:50]}...")
        
        # Get or create lead
        lead = Lead.query.filter_by(phone=from_number).first()
        if not lead:
            lead = Lead(
                name=contact_name,
                phone=from_number,
                status='novo'
            )
            db.session.add(lead)
            db.session.flush()
            
            logger.info(f"🆕 Created new lead: {contact_name} ({from_number})")
        else:
            lead.last_contact = timestamp
        
        # Save message
        message = Message(
            lead_id=lead.id,
            content=message_body,
            sender=contact_name,
            message_type='text'
        )
        db.session.add(message)
        db.session.commit()
        
        logger.info(f"💾 Mensagem salva no banco de dados")
        
        return jsonify({"status": "ok", "message": "Message processed"})
        
    except Exception as e:
        logger.error(f"❌ Error processing connector message: {str(e)}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500