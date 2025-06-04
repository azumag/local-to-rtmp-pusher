#!/bin/bash

# UDP配信システム - Sender起動スクリプト
# 指定された動画ファイルをUDPストリームで送信

set -euo pipefail

# 設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="${SCRIPT_DIR}/../videos"
LOG_DIR="${SCRIPT_DIR}/../logs"
CONFIG_DIR="${SCRIPT_DIR}/../config"

# 環境変数読み込み
if [[ -f "${SCRIPT_DIR}/../.env" ]]; then
    source "${SCRIPT_DIR}/../.env"
fi

# デフォルト設定
UDP_TARGET="${UDP_HOST:-172.20.0.10}:${UDP_PORT:-1234}"
NETWORK_NAME="${COMPOSE_PROJECT_NAME:-streaming}_streaming-network"
LOG_LEVEL="${LOG_LEVEL:-info}"

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
使用方法: $0 <video_file> [options]

引数:
    video_file    送信する動画ファイル名（videos/ディレクトリ内）

オプション:
    -h, --help    この使用方法を表示
    -v, --verbose デバッグログを有効化
    -l, --loop    ループ再生（デフォルト: 無効）
    --no-log      ログ出力を無効化

例:
    $0 main-content.mp4
    $0 standby.mp4 --loop
    $0 test-video.mp4 --verbose

EOF
}

# パラメータ解析
parse_args() {
    VERBOSE=false
    LOOP_ENABLED=false
    LOGGING_ENABLED=true
    
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
            -l|--loop)
                LOOP_ENABLED=true
                shift
                ;;
            --no-log)
                LOGGING_ENABLED=false
                shift
                ;;
            -*)
                error "不明なオプション: $1"
                usage
                exit 1
                ;;
            *)
                if [[ -z "${VIDEO_FILE:-}" ]]; then
                    VIDEO_FILE="$1"
                else
                    error "複数の動画ファイルが指定されました"
                    usage
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    if [[ -z "${VIDEO_FILE:-}" ]]; then
        error "動画ファイルが指定されていません"
        usage
        exit 1
    fi
}

# ファイル検証
validate_video_file() {
    local video_path="${VIDEO_DIR}/${VIDEO_FILE}"
    
    # パストラバーサル攻撃対策
    if [[ "${VIDEO_FILE}" =~ \.\. ]] || [[ "${VIDEO_FILE}" =~ ^/ ]]; then
        error "無効なファイルパス: ${VIDEO_FILE}"
        exit 1
    fi
    
    # ファイル存在確認
    if [[ ! -f "${video_path}" ]]; then
        error "動画ファイルが見つかりません: ${video_path}"
        exit 1
    fi
    
    # ファイル読み取り権限確認
    if [[ ! -r "${video_path}" ]]; then
        error "動画ファイルの読み取り権限がありません: ${video_path}"
        exit 1
    fi
    
    # ファイルサイズ確認
    local file_size
    file_size=$(stat -f%z "${video_path}" 2>/dev/null || stat -c%s "${video_path}" 2>/dev/null || echo 0)
    if [[ "${file_size}" -eq 0 ]]; then
        error "動画ファイルが空です: ${video_path}"
        exit 1
    fi
    
    log "動画ファイル検証完了: ${VIDEO_FILE} (${file_size} bytes)"
}

# 既存のSenderコンテナ停止
stop_existing_senders() {
    log "既存のSenderコンテナを確認中..."
    
    local containers
    containers=$(docker ps --filter "name=streaming-sender" --format "{{.Names}}" 2>/dev/null || true)
    
    if [[ -n "${containers}" ]]; then
        log "既存のSenderコンテナを停止中..."
        echo "${containers}" | while IFS= read -r container_name; do
            log "コンテナ停止: ${container_name}"
            docker stop "${container_name}" >/dev/null 2>&1 || true
        done
        
        # 停止完了まで待機
        sleep 2
    else
        log "既存のSenderコンテナは見つかりませんでした"
    fi
}

# FFmpegコマンド構築
build_ffmpeg_command() {
    local video_path="/app/videos/${VIDEO_FILE}"
    local udp_url="udp://${UDP_TARGET}"
    
    FFMPEG_ARGS=(
        "ffmpeg"
        "-re"                           # リアルタイム読み込み
        "-i" "${video_path}"           # 入力ファイル
    )
    
    # ループ設定
    if [[ "${LOOP_ENABLED}" == "true" ]]; then
        FFMPEG_ARGS+=("-stream_loop" "-1")  # 無限ループ
        log "ループ再生を有効化"
    fi
    
    FFMPEG_ARGS+=(
        "-c" "copy"                     # コーデックコピー（再エンコードなし）
        "-f" "mpegts"                   # MPEG-TS出力形式
    )
    
    # ログレベル設定
    if [[ "${VERBOSE}" == "true" ]]; then
        FFMPEG_ARGS+=("-loglevel" "debug")
    else
        FFMPEG_ARGS+=("-loglevel" "${LOG_LEVEL}")
    fi
    
    # レポート出力（ログが有効な場合）
    if [[ "${LOGGING_ENABLED}" == "true" ]]; then
        FFMPEG_ARGS+=("-report")
    fi
    
    # UDP出力
    FFMPEG_ARGS+=("${udp_url}")
    
    log "FFmpegコマンド: ${FFMPEG_ARGS[*]}"
}

# Senderコンテナ起動
start_sender_container() {
    local container_name="streaming-sender-$(date +%s)"
    local video_volume="${SCRIPT_DIR}/../videos:/app/videos:ro"
    local log_volume="${LOG_DIR}:/app/logs"
    
    log "Senderコンテナ起動: ${container_name}"
    log "UDP送信先: ${UDP_TARGET}"
    log "動画ファイル: ${VIDEO_FILE}"
    
    # Docker実行
    local docker_cmd=(
        "docker" "run"
        "--rm"                          # 停止時に自動削除
        "--name" "${container_name}"
        "--network" "${NETWORK_NAME}"
        "--volume" "${video_volume}"
        "--volume" "${log_volume}"
        "--env" "PUID=1000"
        "--env" "PGID=1000"
        "--env" "TZ=${TZ:-Asia/Tokyo}"
        "--detach"                      # バックグラウンド実行
        "linuxserver/ffmpeg:latest"
        "${FFMPEG_ARGS[@]}"
    )
    
    log "Dockerコマンド実行中..."
    if [[ "${VERBOSE}" == "true" ]]; then
        log "Docker CMD: ${docker_cmd[*]}"
    fi
    
    local container_id
    container_id=$(${docker_cmd[@]})
    
    if [[ $? -eq 0 ]] && [[ -n "${container_id}" ]]; then
        log "コンテナ起動成功: ${container_name} (ID: ${container_id:0:12})"
        
        # 起動確認
        sleep 3
        local status
        status=$(docker inspect --format='{{.State.Status}}' "${container_id}" 2>/dev/null || echo "unknown")
        
        if [[ "${status}" == "running" ]]; then
            log "Senderコンテナは正常に動作しています"
            echo "${container_id}" > "${LOG_DIR}/current_sender.id"
            return 0
        else
            error "Senderコンテナが停止しました (Status: ${status})"
            docker logs "${container_id}" 2>&1 | tail -20 | while IFS= read -r line; do
                error "Container Log: ${line}"
            done
            return 1
        fi
    else
        error "Senderコンテナの起動に失敗しました"
        return 1
    fi
}

# ヘルスチェック
health_check() {
    local container_id_file="${LOG_DIR}/current_sender.id"
    
    if [[ ! -f "${container_id_file}" ]]; then
        log "WARNING: Senderコンテナ情報ファイルが見つかりません"
        return 1
    fi
    
    local container_id
    container_id=$(<"${container_id_file}")
    
    local status
    status=$(docker inspect --format='{{.State.Status}}' "${container_id}" 2>/dev/null || echo "not found")
    
    case "${status}" in
        "running")
            log "ヘルスチェック: 正常"
            return 0
            ;;
        "exited"|"dead")
            error "ヘルスチェック: コンテナが停止しています"
            return 1
            ;;
        "not found")
            error "ヘルスチェック: コンテナが見つかりません"
            return 1
            ;;
        *)
            error "ヘルスチェック: 不明な状態 (${status})"
            return 1
            ;;
    esac
}

# クリーンアップ
cleanup() {
    local exit_code=$?
    
    if [[ ${exit_code} -ne 0 ]]; then
        error "スクリプトがエラーで終了しました (Exit code: ${exit_code})"
    fi
    
    # 一時ファイルのクリーンアップ等があれば記述
    
    exit ${exit_code}
}

# メイン処理
main() {
    # ログディレクトリ作成
    mkdir -p "${LOG_DIR}"
    
    log "=== UDP Sender起動スクリプト開始 ==="
    log "スクリプトバージョン: 1.0"
    log "実行ユーザー: $(whoami)"
    log "作業ディレクトリ: $(pwd)"
    
    # パラメータ解析
    parse_args "$@"
    
    # 動画ファイル検証
    validate_video_file
    
    # 既存のSenderコンテナ停止
    stop_existing_senders
    
    # FFmpegコマンド構築
    build_ffmpeg_command
    
    # Senderコンテナ起動
    if start_sender_container; then
        log "=== Sender起動完了 ==="
        
        # ヘルスチェック実行
        sleep 5
        if health_check; then
            log "Senderは正常に動作しています"
            exit 0
        else
            error "Senderの動作に問題があります"
            exit 1
        fi
    else
        error "=== Sender起動失敗 ==="
        exit 1
    fi
}

# エラーハンドリング設定
trap cleanup EXIT

# メイン処理実行
main "$@"