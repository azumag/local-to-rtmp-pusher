#!/bin/bash

# UDP配信システム - Sender停止スクリプト
# 実行中のSenderコンテナを安全に停止

set -euo pipefail

# 設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}/../logs"

# 環境変数読み込み
if [[ -f "${SCRIPT_DIR}/../.env" ]]; then
    source "${SCRIPT_DIR}/../.env"
fi

# ログ関数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_DIR}/sender.log"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2 | tee -a "${LOG_DIR}/sender.log"
}

# 使用方法表示
usage() {
    cat << EOF
使用方法: $0 [options]

オプション:
    -h, --help     この使用方法を表示
    -f, --force    強制停止（SIGKILL使用）
    -a, --all      すべてのSenderコンテナを停止
    -v, --verbose  詳細ログを表示
    --timeout=N    停止タイムアウト秒数（デフォルト: 10）

例:
    $0                    # 通常停止
    $0 --force           # 強制停止
    $0 --all             # 全Sender停止
    $0 --timeout=30      # 30秒タイムアウト

EOF
}

# パラメータ解析
parse_args() {
    FORCE_STOP=false
    STOP_ALL=false
    VERBOSE=false
    TIMEOUT=10
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -f|--force)
                FORCE_STOP=true
                shift
                ;;
            -a|--all)
                STOP_ALL=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            --timeout=*)
                TIMEOUT="${1#*=}"
                if ! [[ "${TIMEOUT}" =~ ^[0-9]+$ ]] || [[ "${TIMEOUT}" -lt 1 ]]; then
                    error "無効なタイムアウト値: ${TIMEOUT}"
                    exit 1
                fi
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

# Senderコンテナ一覧取得
get_sender_containers() {
    local filter_running_only="${1:-true}"
    
    if [[ "${filter_running_only}" == "true" ]]; then
        docker ps --filter "name=streaming-sender" --format "{{.Names}}" 2>/dev/null || true
    else
        docker ps -a --filter "name=streaming-sender" --format "{{.Names}}" 2>/dev/null || true
    fi
}

# 現在のSenderコンテナ情報取得
get_current_sender() {
    local container_id_file="${LOG_DIR}/current_sender.id"
    
    if [[ -f "${container_id_file}" ]]; then
        local container_id
        container_id=$(<"${container_id_file}")
        
        # コンテナが存在するか確認
        if docker inspect "${container_id}" >/dev/null 2>&1; then
            echo "${container_id}"
        else
            # ファイルが古い場合は削除
            rm -f "${container_id_file}"
        fi
    fi
}

# コンテナ停止
stop_container() {
    local container_name="$1"
    local force="${2:-false}"
    
    log "コンテナ停止中: ${container_name}"
    
    # コンテナ状態確認
    local status
    status=$(docker inspect --format='{{.State.Status}}' "${container_name}" 2>/dev/null || echo "not found")
    
    case "${status}" in
        "not found")
            log "WARNING: コンテナが見つかりません: ${container_name}"
            return 1
            ;;
        "exited"|"dead")
            log "コンテナは既に停止しています: ${container_name}"
            return 0
            ;;
        "running")
            # 停止処理を継続
            ;;
        *)
            log "WARNING: 不明なコンテナ状態: ${status} (${container_name})"
            ;;
    esac
    
    # 停止実行
    local stop_cmd=("docker" "stop")
    
    if [[ "${force}" == "true" ]]; then
        stop_cmd+=("--signal" "SIGKILL")
        log "強制停止モード (SIGKILL)"
    else
        stop_cmd+=("--time" "${TIMEOUT}")
        log "通常停止モード (タイムアウト: ${TIMEOUT}秒)"
    fi
    
    stop_cmd+=("${container_name}")
    
    if [[ "${VERBOSE}" == "true" ]]; then
        log "実行コマンド: ${stop_cmd[*]}"
    fi
    
    # 停止実行
    local start_time
    start_time=$(date +%s)
    
    if "${stop_cmd[@]}" >/dev/null 2>&1; then
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        log "コンテナ停止完了: ${container_name} (所要時間: ${duration}秒)"
        return 0
    else
        error "コンテナ停止失敗: ${container_name}"
        return 1
    fi
}

# コンテナ削除
remove_container() {
    local container_name="$1"
    
    # 削除が必要か確認
    local status
    status=$(docker inspect --format='{{.State.Status}}' "${container_name}" 2>/dev/null || echo "not found")
    
    if [[ "${status}" == "not found" ]]; then
        return 0
    fi
    
    if [[ "${status}" == "running" ]]; then
        log "WARNING: 実行中のコンテナは削除できません: ${container_name}"
        return 1
    fi
    
    log "コンテナ削除中: ${container_name}"
    
    if docker rm "${container_name}" >/dev/null 2>&1; then
        log "コンテナ削除完了: ${container_name}"
        return 0
    else
        error "コンテナ削除失敗: ${container_name}"
        return 1
    fi
}

# 現在のSender停止
stop_current_sender() {
    local current_sender
    current_sender=$(get_current_sender)
    
    if [[ -n "${current_sender}" ]]; then
        log "現在のSenderコンテナを停止します: ${current_sender}"
        
        # コンテナ名取得（IDの場合）
        local container_name
        container_name=$(docker inspect --format='{{.Name}}' "${current_sender}" 2>/dev/null | sed 's/^\//' || echo "${current_sender}")
        
        if stop_container "${container_name}" "${FORCE_STOP}"; then
            # 追跡ファイル削除
            rm -f "${LOG_DIR}/current_sender.id"
            return 0
        else
            return 1
        fi
    else
        log "現在のSenderコンテナは見つかりませんでした"
        return 0
    fi
}

# 全Sender停止
stop_all_senders() {
    log "すべてのSenderコンテナを停止します"
    
    local containers
    containers=$(get_sender_containers "true")
    
    if [[ -z "${containers}" ]]; then
        log "実行中のSenderコンテナは見つかりませんでした"
        return 0
    fi
    
    local success_count=0
    local total_count=0
    
    echo "${containers}" | while IFS= read -r container_name; do
        total_count=$((total_count + 1))
        
        if stop_container "${container_name}" "${FORCE_STOP}"; then
            success_count=$((success_count + 1))
        fi
    done
    
    # 停止後のクリーンアップ
    cleanup_stopped_containers
    
    log "Sender停止完了: ${success_count}/${total_count}"
    
    # 追跡ファイル削除
    rm -f "${LOG_DIR}/current_sender.id"
    
    if [[ ${success_count} -eq ${total_count} ]]; then
        return 0
    else
        return 1
    fi
}

# 停止済みコンテナのクリーンアップ
cleanup_stopped_containers() {
    log "停止済みSenderコンテナをクリーンアップ中..."
    
    local stopped_containers
    stopped_containers=$(docker ps -a --filter "name=streaming-sender" --filter "status=exited" --format "{{.Names}}" 2>/dev/null || true)
    
    if [[ -n "${stopped_containers}" ]]; then
        local removed_count=0
        
        echo "${stopped_containers}" | while IFS= read -r container_name; do
            if remove_container "${container_name}"; then
                removed_count=$((removed_count + 1))
            fi
        done
        
        log "クリーンアップ完了: ${removed_count}個のコンテナを削除"
    else
        log "クリーンアップ対象のコンテナはありませんでした"
    fi
}

# ステータス確認
check_status() {
    log "Senderコンテナ状況:"
    
    local running_containers
    running_containers=$(get_sender_containers "true")
    
    if [[ -n "${running_containers}" ]]; then
        echo "${running_containers}" | while IFS= read -r container_name; do
            local status
            local created
            status=$(docker inspect --format='{{.State.Status}}' "${container_name}" 2>/dev/null || echo "unknown")
            created=$(docker inspect --format='{{.Created}}' "${container_name}" 2>/dev/null || echo "unknown")
            
            log "  ${container_name}: ${status} (作成: ${created})"
        done
    else
        log "  実行中のSenderコンテナはありません"
    fi
    
    # 現在のSender情報
    local current_sender
    current_sender=$(get_current_sender)
    if [[ -n "${current_sender}" ]]; then
        log "現在のSender: ${current_sender}"
    else
        log "現在のSender: なし"
    fi
}

# メイン処理
main() {
    # ログディレクトリ作成
    mkdir -p "${LOG_DIR}"
    
    log "=== UDP Sender停止スクリプト開始 ==="
    
    # パラメータ解析
    parse_args "$@"
    
    # 実行前の状況確認
    if [[ "${VERBOSE}" == "true" ]]; then
        check_status
    fi
    
    # 停止処理
    local exit_code=0
    
    if [[ "${STOP_ALL}" == "true" ]]; then
        if ! stop_all_senders; then
            exit_code=1
        fi
    else
        if ! stop_current_sender; then
            exit_code=1
        fi
    fi
    
    # 実行後の状況確認
    if [[ "${VERBOSE}" == "true" ]]; then
        check_status
    fi
    
    if [[ ${exit_code} -eq 0 ]]; then
        log "=== Sender停止完了 ==="
    else
        error "=== Sender停止中にエラーが発生しました ==="
    fi
    
    exit ${exit_code}
}

# メイン処理実行
main "$@"