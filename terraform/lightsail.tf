# StreamCaster Lightsail Resources

# === LIGHTSAIL INSTANCE ===
resource "aws_lightsail_instance" "streamcaster" {
  name              = local.instance_name
  availability_zone = var.availability_zone != "" ? var.availability_zone : data.aws_availability_zones.available.names[0]
  blueprint_id      = var.instance_blueprint_id
  bundle_id         = var.instance_bundle_id
  user_data         = local.user_data
  key_pair_name     = var.ssh_public_key_path != "" ? aws_lightsail_key_pair.streamcaster[0].name : null

  tags = {
    Name        = local.instance_name
    Purpose     = "StreamCaster Application Server"
    Bundle      = var.instance_bundle_id
    Blueprint   = var.instance_blueprint_id
  }
}

# === STATIC IP ===
resource "aws_lightsail_static_ip" "streamcaster" {
  count = var.enable_static_ip ? 1 : 0
  name  = local.static_ip_name
}

resource "aws_lightsail_static_ip_attachment" "streamcaster" {
  count          = var.enable_static_ip ? 1 : 0
  static_ip_name = aws_lightsail_static_ip.streamcaster[0].name
  instance_name  = aws_lightsail_instance.streamcaster.name
  
  lifecycle {
    create_before_destroy = true
  }
  
  depends_on = [
    aws_lightsail_instance.streamcaster,
    aws_lightsail_static_ip.streamcaster
  ]
}

# === FIREWALL RULES ===
resource "aws_lightsail_instance_public_ports" "streamcaster" {
  instance_name = aws_lightsail_instance.streamcaster.name

  dynamic "port_info" {
    for_each = local.firewall_rules
    content {
      from_port   = port_info.value.port
      to_port     = port_info.value.port
      protocol    = port_info.value.protocol
      cidrs       = port_info.value.cidrs
    }
  }

  depends_on = [aws_lightsail_instance.streamcaster]
}

# === KEY PAIR (Optional - for SSH access) ===
resource "aws_lightsail_key_pair" "streamcaster" {
  count = var.ssh_public_key_path != "" ? 1 : 0
  name       = "${local.instance_name}-keypair"
  public_key = var.ssh_public_key_path != "" ? file(var.ssh_public_key_path) : null
  
  tags = {
    Name    = "${local.instance_name}-keypair"
    Purpose = "SSH access to StreamCaster instance"
  }
}

# === AUTOMATIC SNAPSHOTS (Optional) ===
# Note: Lightsail snapshots are typically created manually or via CloudWatch
# resource "aws_lightsail_instance_snapshot" "streamcaster_initial" {
#   # This resource type is not available in the AWS provider
#   # Use AWS CLI or console for snapshot management
# }

# === DOMAIN (Optional - for custom domain) ===
# Uncomment if you want to use a custom domain
# resource "aws_lightsail_domain" "streamcaster" {
#   domain_name = var.custom_domain
#   
#   tags = {
#     Name = var.custom_domain
#   }
# }

# resource "aws_lightsail_domain_entry" "streamcaster_a" {
#   domain_name = aws_lightsail_domain.streamcaster.domain_name
#   name        = ""
#   type        = "A"
#   target      = var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : aws_lightsail_instance.streamcaster.public_ip_address
# }

# resource "aws_lightsail_domain_entry" "streamcaster_www" {
#   domain_name = aws_lightsail_domain.streamcaster.domain_name
#   name        = "www"
#   type        = "A"
#   target      = var.enable_static_ip ? aws_lightsail_static_ip.streamcaster[0].ip_address : aws_lightsail_instance.streamcaster.public_ip_address
# }