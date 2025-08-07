"""
BudBot WhatsApp Connector Backend Integration v5.0
Handles webhook events from WhatsApp Connector service
"""

import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from loguru import logger
import pytz

# Import database and models
from backend.extensions import db
from backend.models import Lead, Message

# Create blueprint
whatsapp_connector_bp = Blueprint('whatsapp_connector', __name__)

# Timezone configuration
BRAZIL_TZ = pytz.timezone('America/Sao_Paulo')

@whatsapp_connector_bp.route('/connector', methods=['POST'])
def handle_connector_webhook():
    """
    Handle webhook events from WhatsApp Connector v5.0
    
    Supported events:
    - qr_generated: QR code generated for scanning
    - client_ready: WhatsApp client connected successfully  
    - authenticated: WhatsApp session authenticated
    - message_received: New message received from WhatsApp
    - disconnected: WhatsApp client disconnected
    """
    try:
        # Validate request
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        # Validate required fields
        event = data.get('event')
        if not event:
            return jsonify({'error': 'Missing event field'}), 400
        
        # Log incoming event
        logger.info(f"📡 Received connector event: {event}")
        
        # Validate token (basic security)
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid Authorization header'}), 401
        
        token = auth_header.replace('Bearer ', '')
        expected_token = 'budbot_webhook_secret_2025'  # Should be from environment
        if token != expected_token:
            return jsonify({'error': 'Invalid webhook token'}), 401
        
        # Route events to appropriate handlers
        if event == 'qr_generated':
            return handle_qr_generated(data)
        elif event == 'client_ready':
            return handle_client_ready(data)
        elif event == 'authenticated':
            return handle_authenticated(data)
        elif event == 'message_received':
            return handle_message_received(data)
        elif event == 'disconnected':
            return handle_disconnected(data)
        else:
            logger.warning(f"⚠️ Unknown event type: {event}")
            return jsonify({'error': f'Unknown event type: {event}'}), 400
            
    except Exception as e:
        logger.error(f"❌ Error processing connector webhook: {e}")
        return jsonify({'error': str(e)}), 500

def handle_qr_generated(data):
    """Handle QR code generation event"""
    try:
        qr_data = data.get('data', {})
        qr_code = qr_data.get('qr_code', '')
        
        logger.info("✅ QR Code gerado pelo connector")
        
        # Here you could store QR code in database or notify admins
        # For now, just acknowledge receipt
        
        return jsonify({
            'status': 'ok',
            'message': 'QR code received',
            'timestamp': datetime.now(BRAZIL_TZ).isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Error handling QR generated: {e}")
        return jsonify({'error': str(e)}), 500

def handle_client_ready(data):
    """Handle WhatsApp client ready event"""
    try:
        event_data = data.get('data', {})
        session_id = event_data.get('session_id', 'main')
        
        logger.info(f"✅ WhatsApp client ready for session: {session_id}")
        
        # Here you could update session status in database
        # Mark WhatsApp as connected and ready
        
        return jsonify({
            'status': 'ok',
            'message': 'Client ready acknowledged',
            'session_id': session_id,
            'timestamp': datetime.now(BRAZIL_TZ).isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Error handling client ready: {e}")
        return jsonify({'error': str(e)}), 500

def handle_authenticated(data):
    """Handle WhatsApp authentication success event"""
    try:
        event_data = data.get('data', {})
        
        logger.info("✅ WhatsApp authenticated successfully")
        
        return jsonify({
            'status': 'ok',
            'message': 'Authentication acknowledged',
            'timestamp': datetime.now(BRAZIL_TZ).isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Error handling authentication: {e}")
        return jsonify({'error': str(e)}), 500

def handle_message_received(data):
    """Handle new WhatsApp message received"""
    try:
        message_data = data.get('data', {})
        
        # Extract message information
        from_number = message_data.get('from', '')
        message_body = message_data.get('body', '')
        message_timestamp = message_data.get('timestamp', 0)
        
        # Extract contact information
        contact_info = message_data.get('contact', {})
        contact_name = contact_info.get('name', 'Unknown')
        contact_number = contact_info.get('number', '')
        
        # Clean phone number (remove @c.us suffix)
        if '@c.us' in from_number:
            clean_number = from_number.replace('@c.us', '')
        else:
            clean_number = contact_number or from_number
        
        logger.info(f"📨 Processando mensagem de {contact_name} ({clean_number}): {message_body[:50]}...")
        
        # Convert timestamp to datetime
        if message_timestamp:
            timestamp = datetime.fromtimestamp(message_timestamp, tz=BRAZIL_TZ)
        else:
            timestamp = datetime.now(BRAZIL_TZ)
        
        # Find or create lead
        lead = Lead.query.filter_by(phone=clean_number).first()
        if not lead:
            # Create new lead
            lead = Lead(
                name=contact_name,
                phone=clean_number,
                status='novo'
            )
            db.session.add(lead)
            db.session.flush()  # Get the ID
            logger.info(f"🆕 Created new lead: {contact_name} ({clean_number})")
        else:
            # Update existing lead
            if lead.name == 'Unknown' and contact_name != 'Unknown':
                lead.name = contact_name
            lead.last_contact = timestamp
            logger.info(f"📝 Updated existing lead: {lead.name} ({clean_number})")
        
        # Save message
        message = Message(
            lead_id=lead.id,
            content=message_body,
            sender=contact_name,
            message_type='text'
        )
        
        db.session.add(message)
        db.session.commit()
        
        logger.info("💾 Mensagem salva no banco de dados")
        
        # Here you could trigger AI response generation
        # For now, just acknowledge receipt
        
        return jsonify({
            'status': 'ok',
            'message': 'Message processed',
            'lead_id': lead.id,
            'message_id': message.id,
            'timestamp': timestamp.isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Error processing connector message: {e}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

def handle_disconnected(data):
    """Handle WhatsApp client disconnection event"""
    try:
        event_data = data.get('data', {})
        reason = event_data.get('reason', 'Unknown')
        retry_count = event_data.get('retry_count', 0)
        
        logger.warning(f"⚠️ WhatsApp disconnected: {reason} (retry {retry_count})")
        
        # Here you could update session status or notify admins
        
        return jsonify({
            'status': 'ok',
            'message': 'Disconnection acknowledged',
            'reason': reason,
            'retry_count': retry_count,
            'timestamp': datetime.now(BRAZIL_TZ).isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Error handling disconnection: {e}")
        return jsonify({'error': str(e)}), 500

@whatsapp_connector_bp.route('/connector/health', methods=['GET'])
def connector_health():
    """Health check endpoint for connector integration"""
    try:
        # Check database connectivity
        db.session.execute('SELECT 1')
        
        # Get basic stats
        total_leads = Lead.query.count()
        total_messages = Message.query.count()
        
        return jsonify({
            'status': 'healthy',
            'message': 'WhatsApp Connector integration is working',
            'database': 'connected',
            'stats': {
                'total_leads': total_leads,
                'total_messages': total_messages
            },
            'timestamp': datetime.now(BRAZIL_TZ).isoformat(),
            'version': '5.0.0'
        })
        
    except Exception as e:
        logger.error(f"❌ Connector health check failed: {e}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now(BRAZIL_TZ).isoformat()
        }), 500