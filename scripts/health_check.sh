#!/bin/bash

# UDP配信システム - ヘルスチェックスクリプト
# システム全体の健全性を監視・確認

set -euo pipefail

# 設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/../logs"
CONFIG_DIR="${SCRIPT_DIR}/../config"

# 環境変数読み込み
if [[ -f "${SCRIPT_DIR}/../.env" ]]; then
    source "${SCRIPT_DIR}/../.env"
fi

# デフォルト設定
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-streaming}"
UDP_HOST="${UDP_HOST:-172.20.0.10}"
UDP_PORT="${UDP_PORT:-1234}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"
ALERT_THRESHOLD="${ALERT_THRESHOLD:-3}"

# グローバル変数
HEALTH_STATUS=0  # 0=正常, 1=警告, 2=エラー
ALERTS=()
WARNINGS=()
INFOS=()

# ログ関数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_DIR}/health.log"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2 | tee -a "${LOG_DIR}/health.log"
    ALERTS+=("$1")
    HEALTH_STATUS=2
}

warning() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1" | tee -a "${LOG_DIR}/health.log"
    WARNINGS+=("$1")
    if [[ ${HEALTH_STATUS} -lt 1 ]]; then
        HEALTH_STATUS=1
    fi
}

info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1" | tee -a "${LOG_DIR}/health.log"
    INFOS+=("$1")
}

# 使用方法表示
usage() {
    cat << EOF
使用方法: $0 [options]

オプション:
    -h, --help          この使用方法を表示
    -v, --verbose       詳細ログを表示
    -q, --quiet         エラーのみ表示
    -w, --watch         連続監視モード
    -i, --interval=N    監視間隔（秒、デフォルト: 30）
    -j, --json          JSON形式で出力
    --no-docker         Dockerチェックをスキップ
    --no-network        ネットワークチェックをスキップ
    --no-resources      リソースチェックをスキップ

チェック対象:
    • Dockerコンテナ状態
    • ネットワーク接続性
    • UDPポート状態
    • システムリソース
    • ログファイル
    • 設定ファイル

例:
    $0                    # 1回実行
    $0 --watch            # 連続監視
    $0 --json             # JSON出力
    $0 --interval=60 -w   # 60秒間隔で監視

EOF
}

# パラメータ解析
parse_args() {
    VERBOSE=false
    QUIET=false
    WATCH_MODE=false
    JSON_OUTPUT=false
    CHECK_DOCKER=true
    CHECK_NETWORK=true
    CHECK_RESOURCES=true
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -w|--watch)
                WATCH_MODE=true
                shift
                ;;
            -i|--interval)
                CHECK_INTERVAL="$2"
                if ! [[ "${CHECK_INTERVAL}" =~ ^[0-9]+$ ]] || [[ "${CHECK_INTERVAL}" -lt 1 ]]; then
                    error "無効な監視間隔: ${CHECK_INTERVAL}"
                    exit 1
                fi
                shift 2
                ;;
            --interval=*)
                CHECK_INTERVAL="${1#*=}"
                if ! [[ "${CHECK_INTERVAL}" =~ ^[0-9]+$ ]] || [[ "${CHECK_INTERVAL}" -lt 1 ]]; then
                    error "無効な監視間隔: ${CHECK_INTERVAL}"
                    exit 1
                fi
                shift
                ;;
            -j|--json)
                JSON_OUTPUT=true
                shift
                ;;
            --no-docker)
                CHECK_DOCKER=false
                shift
                ;;
            --no-network)
                CHECK_NETWORK=false
                shift
                ;;
            --no-resources)
                CHECK_RESOURCES=false
                shift
                ;;
            -*)
                error "不明なオプション: $1"
                usage
                exit 1
                ;;
            *)
                error "不要な引数: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Dockerサービス確認
check_docker_service() {
    if [[ "${CHECK_DOCKER}" == "false" ]]; then
        return 0
    fi
    
    info "Dockerサービス状態をチェック中..."
    
    # Docker daemon確認
    if ! docker info >/dev/null 2>&1; then
        error "Dockerデーモンが応答しません"
        return 1
    fi
    
    # Docker Compose確認
    if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
        warning "Docker Composeが見つかりません"
    fi
    
    info "Docker: 正常"
    return 0
}

# コンテナ状態確認
check_containers() {
    if [[ "${CHECK_DOCKER}" == "false" ]]; then
        return 0
    fi
    
    info "コンテナ状態をチェック中..."
    
    local container_status=0
    
    # Receiverコンテナチェック
    local receiver_status
    receiver_status=$(docker inspect --format='{{.State.Status}}' "streaming-receiver" 2>/dev/null || echo "not found")
    
    case "${receiver_status}" in
        "running")
            info "Receiver: 実行中"
            ;;
        "exited"|"dead")
            error "Receiver: 停止中 (${receiver_status})"
            container_status=1
            ;;
        "not found")
            error "Receiver: コンテナが見つかりません"
            container_status=1
            ;;
        *)
            warning "Receiver: 不明な状態 (${receiver_status})"
            container_status=1
            ;;
    esac
    
    # Controllerコンテナチェック
    local controller_status
    controller_status=$(docker inspect --format='{{.State.Status}}' "streaming-controller" 2>/dev/null || echo "not found")
    
    case "${controller_status}" in
        "running")
            info "Controller: 実行中"
            ;;
        "exited"|"dead")
            error "Controller: 停止中 (${controller_status})"
            container_status=1
            ;;
        "not found")
            warning "Controller: コンテナが見つかりません（スタンドアロン実行？）"
            ;;
        *)
            warning "Controller: 不明な状態 (${controller_status})"
            ;;
    esac
    
    # Senderコンテナチェック
    local sender_containers
    sender_containers=$(docker ps --filter "name=streaming-sender" --format "{{.Names}}" 2>/dev/null || true)
    
    local sender_count=0
    if [[ -n "${sender_containers}" ]]; then
        sender_count=$(echo "${sender_containers}" | wc -l | tr -d ' ')
        info "Sender: ${sender_count}個のコンテナが実行中"
        
        if [[ "${VERBOSE}" == "true" ]]; then
            echo "${sender_containers}" | while IFS= read -r container_name; do
                local uptime
                uptime=$(docker inspect --format='{{.State.StartedAt}}' "${container_name}" 2>/dev/null || echo "unknown")
                info "  ${container_name} (開始: ${uptime})"
            done
        fi
    else
        info "Sender: 実行中のコンテナなし"
    fi
    
    return ${container_status}
}

# ネットワーク接続確認
check_network() {
    if [[ "${CHECK_NETWORK}" == "false" ]]; then
        return 0
    fi
    
    info "ネットワーク接続をチェック中..."
    
    local network_status=0
    
    # Docker network確認
    local network_name="${COMPOSE_PROJECT_NAME}_streaming-network"
    if docker network inspect "${network_name}" >/dev/null 2>&1; then
        info "Dockerネットワーク: 正常 (${network_name})"
    else
        error "Dockerネットワークが見つかりません: ${network_name}"
        network_status=1
    fi
    
    # UDPポート確認
    info "UDPポート ${UDP_PORT} をチェック中..."
    if command -v netstat >/dev/null 2>&1; then
        if netstat -ulpn 2>/dev/null | grep -q ":${UDP_PORT}"; then
            info "UDPポート: リスニング中 (${UDP_PORT})"
        else
            warning "UDPポート: リスニングされていません (${UDP_PORT})"
        fi
    elif command -v ss >/dev/null 2>&1; then
        if ss -ulpn 2>/dev/null | grep -q ":${UDP_PORT}"; then
            info "UDPポート: リスニング中 (${UDP_PORT})"
        else
            warning "UDPポート: リスニングされていません (${UDP_PORT})"
        fi
    else
        warning "ネットワーク確認ツールが見つかりません (netstat/ss)"
    fi
    
    return ${network_status}
}

# システムリソース確認
check_resources() {
    if [[ "${CHECK_RESOURCES}" == "false" ]]; then
        return 0
    fi
    
    info "システムリソースをチェック中..."
    
    local resource_status=0
    
    # CPU使用率確認
    if command -v top >/dev/null 2>&1; then
        local cpu_usage
        cpu_usage=$(top -l 1 -n 0 2>/dev/null | grep "CPU usage" | awk '{print $3}' | sed 's/%//' || echo "unknown")
        
        if [[ "${cpu_usage}" != "unknown" ]]; then
            if (( $(echo "${cpu_usage} > 80" | bc -l 2>/dev/null || echo 0) )); then
                warning "CPU使用率が高い: ${cpu_usage}%"
            else
                info "CPU使用率: ${cpu_usage}%"
            fi
        fi
    fi
    
    # メモリ使用率確認
    if command -v free >/dev/null 2>&1; then
        local memory_info
        memory_info=$(free -m 2>/dev/null | grep "^Mem:" | awk '{printf "%.1f", ($3/$2)*100}' || echo "unknown")
        
        if [[ "${memory_info}" != "unknown" ]]; then
            if (( $(echo "${memory_info} > 90" | bc -l 2>/dev/null || echo 0) )); then
                warning "メモリ使用率が高い: ${memory_info}%"
            else
                info "メモリ使用率: ${memory_info}%"
            fi
        fi
    elif [[ -f /proc/meminfo ]]; then
        local total_mem available_mem usage_percent
        total_mem=$(grep "^MemTotal:" /proc/meminfo | awk '{print $2}')
        available_mem=$(grep "^MemAvailable:" /proc/meminfo | awk '{print $2}')
        
        if [[ -n "${total_mem}" ]] && [[ -n "${available_mem}" ]]; then
            usage_percent=$(awk "BEGIN {printf \"%.1f\", (1-${available_mem}/${total_mem})*100}")
            
            if (( $(echo "${usage_percent} > 90" | bc -l 2>/dev/null || echo 0) )); then
                warning "メモリ使用率が高い: ${usage_percent}%"
            else
                info "メモリ使用率: ${usage_percent}%"
            fi
        fi
    fi
    
    # ディスク使用量確認
    if command -v df >/dev/null 2>&1; then
        local disk_usage
        disk_usage=$(df . 2>/dev/null | tail -1 | awk '{print $5}' | sed 's/%//' || echo "unknown")
        
        if [[ "${disk_usage}" != "unknown" ]]; then
            if [[ ${disk_usage} -gt 90 ]]; then
                warning "ディスク使用率が高い: ${disk_usage}%"
            else
                info "ディスク使用率: ${disk_usage}%"
            fi
        fi
    fi
    
    return ${resource_status}
}

# ファイル・ディレクトリ確認
check_files() {
    info "ファイル・ディレクトリをチェック中..."
    
    local file_status=0
    
    # 重要ディレクトリの存在確認
    local dirs=("${LOG_DIR}" "${CONFIG_DIR}" "${SCRIPT_DIR}/../videos")
    for dir in "${dirs[@]}"; do
        if [[ -d "${dir}" ]]; then
            info "ディレクトリ: ${dir} (存在)"
        else
            warning "ディレクトリが見つかりません: ${dir}"
            file_status=1
        fi
    done
    
    # 設定ファイル確認
    local config_file="${SCRIPT_DIR}/../.env"
    if [[ -f "${config_file}" ]]; then
        info "設定ファイル: ${config_file} (存在)"
    else
        warning "設定ファイルが見つかりません: ${config_file}"
        file_status=1
    fi
    
    # Docker Compose設定確認
    local compose_file="${SCRIPT_DIR}/../docker-compose.yml"
    if [[ -f "${compose_file}" ]]; then
        info "Docker Compose設定: ${compose_file} (存在)"
    else
        error "Docker Compose設定が見つかりません: ${compose_file}"
        file_status=1
    fi
    
    # ログファイル確認
    local log_files=("${LOG_DIR}/health.log" "${LOG_DIR}/sender.log")
    for log_file in "${log_files[@]}"; do
        if [[ -f "${log_file}" ]]; then
            local log_size
            log_size=$(stat -f%z "${log_file}" 2>/dev/null || stat -c%s "${log_file}" 2>/dev/null || echo 0)
            
            # ログサイズ警告（100MB以上）
            if [[ ${log_size} -gt 104857600 ]]; then
                warning "ログファイルが大きすぎます: ${log_file} ($(( log_size / 1024 / 1024 ))MB)"
            fi
        fi
    done
    
    return ${file_status}
}

# サマリー出力
output_summary() {
    if [[ "${JSON_OUTPUT}" == "true" ]]; then
        output_json_summary
        return
    fi
    
    echo
    echo "==================== ヘルスチェック結果 ===================="
    
    # 全体ステータス
    case ${HEALTH_STATUS} in
        0)
            echo "総合ステータス: ✅ 正常"
            ;;
        1)
            echo "総合ステータス: ⚠️  警告あり"
            ;;
        2)
            echo "総合ステータス: ❌ エラーあり"
            ;;
    esac
    
    echo "チェック時刻: $(date '+%Y-%m-%d %H:%M:%S')"
    echo
    
    # エラー表示
    if [[ ${#ALERTS[@]} -gt 0 ]]; then
        echo "🚨 エラー (${#ALERTS[@]}件):"
        for alert in "${ALERTS[@]}"; do
            echo "  • ${alert}"
        done
        echo
    fi
    
    # 警告表示
    if [[ ${#WARNINGS[@]} -gt 0 ]]; then
        echo "⚠️  警告 (${#WARNINGS[@]}件):"
        for warning in "${WARNINGS[@]}"; do
            echo "  • ${warning}"
        done
        echo
    fi
    
    # 詳細情報（Verboseモード）
    if [[ "${VERBOSE}" == "true" ]] && [[ ${#INFOS[@]} -gt 0 ]]; then
        echo "ℹ️  詳細情報 (${#INFOS[@]}件):"
        for info in "${INFOS[@]}"; do
            echo "  • ${info}"
        done
        echo
    fi
    
    echo "============================================================"
}

# JSON形式サマリー出力
output_json_summary() {
    local status_text
    case ${HEALTH_STATUS} in
        0) status_text="healthy" ;;
        1) status_text="warning" ;;
        2) status_text="error" ;;
    esac
    
    echo "{"
    echo "  \"status\": \"${status_text}\","
    echo "  \"timestamp\": \"$(date -Iseconds)\","
    echo "  \"checks\": {"
    echo "    \"docker\": ${CHECK_DOCKER},"
    echo "    \"network\": ${CHECK_NETWORK},"
    echo "    \"resources\": ${CHECK_RESOURCES}"
    echo "  },"
    echo "  \"results\": {"
    echo "    \"errors\": $(printf '%s\n' "${ALERTS[@]}" | jq -R . | jq -s . 2>/dev/null || echo '[]'),"
    echo "    \"warnings\": $(printf '%s\n' "${WARNINGS[@]}" | jq -R . | jq -s . 2>/dev/null || echo '[]'),"
    echo "    \"info\": $(printf '%s\n' "${INFOS[@]}" | jq -R . | jq -s . 2>/dev/null || echo '[]')"
    echo "  }"
    echo "}"
}

# 1回のヘルスチェック実行
run_health_check() {
    # 状態リセット
    HEALTH_STATUS=0
    ALERTS=()
    WARNINGS=()
    INFOS=()
    
    local start_time
    start_time=$(date +%s)
    
    if [[ "${QUIET}" == "false" ]]; then
        log "=== ヘルスチェック開始 ==="
    fi
    
    # 各チェック実行
    check_docker_service
    check_containers
    check_network
    check_resources
    check_files
    
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [[ "${QUIET}" == "false" ]]; then
        log "=== ヘルスチェック完了 (所要時間: ${duration}秒) ==="
    fi
    
    # サマリー出力
    if [[ "${QUIET}" == "false" ]] || [[ ${HEALTH_STATUS} -gt 0 ]]; then
        output_summary
    fi
    
    return ${HEALTH_STATUS}
}

# 監視モード
watch_mode() {
    log "連続監視モード開始 (間隔: ${CHECK_INTERVAL}秒)"
    log "停止するには Ctrl+C を押してください"
    
    local check_count=0
    local error_count=0
    
    # シグナルハンドラー設定
    trap 'log "監視モード終了"; exit 0' INT TERM
    
    while true; do
        check_count=$((check_count + 1))
        
        echo
        echo "🔄 チェック #${check_count} ($(date '+%H:%M:%S'))"
        echo "----------------------------------------"
        
        if ! run_health_check; then
            error_count=$((error_count + 1))
            
            # 連続エラー警告
            if [[ ${error_count} -ge ${ALERT_THRESHOLD} ]]; then
                error "連続エラー ${error_count}回 - システムに深刻な問題がある可能性があります"
            fi
        else
            error_count=0
        fi
        
        echo "次のチェックまで ${CHECK_INTERVAL}秒待機..."
        sleep "${CHECK_INTERVAL}"
    done
}

# メイン処理
main() {
    # ログディレクトリ作成
    mkdir -p "${LOG_DIR}"
    
    # パラメータ解析
    parse_args "$@"
    
    # 監視モードまたは1回実行
    if [[ "${WATCH_MODE}" == "true" ]]; then
        watch_mode
    else
        run_health_check
        exit ${HEALTH_STATUS}
    fi
}

# メイン処理実行
main "$@"