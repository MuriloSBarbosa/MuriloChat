import * as model from "../services/chatModel.mjs"
import { servidorIo } from "../../app.mjs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import moment from "moment-timezone";

const moduleURL = new URL(import.meta.url);
const modulePath = dirname(fileURLToPath(moduleURL));


export async function criarSala(req, res) {
    let { identificador, nome } = req.body;
    let { id: idUsuario, nome: nomeUser } = req.usuario;
    let { tokenUsuario } = req.headers.authorization.split(" ")[1];
    identificador = decodeURI(identificador);

    try {
        const sala = await model.cadastrarSala(nome, identificador);
        await model.inserirUser(sala.insertId, idUsuario);

        const mensagem = {
            idSala: sala.insertId,
            room: identificador,
            texto: `${nomeUser} criou o chat`,
            tokenUsuario,
            isAddUser: true
        };

        const dtAdd = moment().tz("America/Sao_Paulo").format("YYYY-MM-DD HH:mm:ss");

        servidorIo.to(Number(identificador)).emit('addUser');
        servidorIo.to(Number(identificador)).emit('novaMensagem', mensagem);

        await model.inserirMensagem(idUsuario, sala.insertId, mensagem.texto, dtAdd, true);

        res.status(201).json({ idSala: sala.insertId, identificador });
    } catch (erro) {
        res.status(500).send("Erro ao cadastrar Chat: " + erro);
    }
}


export async function inserirUser(req, res) {
    try {
        const { idSala, idUser, room, nomeUser, dtAdd } = req.body;
        const { tokenUsuario } = req.headers.authorization.split(" ")[1];
        const { nome } = req.usuario;

        const usuario = await model.verificarUsuarioNaSala(idSala, idUser);

        if (usuario.length > 0) {
            return res.status(409).send("Usuário já está na sala");
        }

        await model.inserirUser(idSala, idUser);

        const mensagem = {
            idSala,
            room,
            texto: `${nome} adicionou ${nomeUser} ao chat`,
            tokenUsuario,
            isAddUser: true
        };

        servidorIo.to(Number(room)).emit('addUser');
        servidorIo.to(Number(room)).emit('novaMensagem', mensagem);

        await model.inserirMensagem(idUser, idSala, mensagem.texto, dtAdd, true);

        return res.status(201).send("Chat cadastrado com sucesso!");
    } catch (erro) {
        return res.status(500).send("Erro ao cadastrar Chat: " + erro);
    }
}


export function listarChats(req, res) {
    let { id } = req.usuario;

    model.listarChats(id)
        .then((chats) => {
            res.status(200).send(chats);
        }).catch((erro) => {
            res.status(500).send("Erro ao listar Chats: " + erro);
        });
}

export function listarMensagens(req, res) {
    let { fkSala } = req.params;
    let { id } = req.usuario;

    model.listarMensagens(fkSala)
        .then((mensagens) => {
            const mensagemFormatada = mensagens.map((mensagem) => {
                if (mensagem.fkUsuario == id) {
                    mensagem.isRemetente = true;
                }
                mensagem.idColor = mensagem.fkUsuario;
                delete mensagem.fkUsuario;

                const { 'Usuario.nome': nome, 'Usuario.perfilSrc': perfilSrc, ...outrosCampos } = mensagem;
                delete mensagem['Usuario.nome'];
                delete mensagem['Usuario.perfilSrc'];

                return { nome, perfilSrc, ...outrosCampos };

            });
            res.status(200).send(mensagemFormatada);

        }).catch((erro) => {
            res.status(500).send("Erro ao listar Mensagens: " + erro);
        });
}

export function verUsuariosDaSala(req, res) {
    let { idSala } = req.params;

    model.verUsuariosDaSala(idSala)
        .then((usuarios) => {
            res.status(200).send(usuarios);
        }).catch((erro) => {
            res.status(500).send("Erro ao listar usuários da Sala: " + erro);
        });
}


export function inserirMensagemImagem(req, res) {
    const { fkSala } = req.params;
    const { id, nome } = req.usuario;
    const token = req.headers.authorization.split(" ")[1];
    const { filename } = req.file;
    const { room, dtMensagem } = req.body;

    if (!filename || !room || !dtMensagem) {
        return res.status(400).send("Dados inválidos");
    }
    const srcImage = encodeURI(filename);

    const mensagem = {
        id,
        nome,
        srcImage,
        token,
        dtMensagem
    }

    servidorIo.to(decodeURI(room)).emit('novaMensagem', mensagem);

    model.inserirMensagemImagem(id, fkSala, srcImage, dtMensagem)
        .then(() => {
            res.status(201).send("Mensagem cadastrada com sucesso!");
        }).catch((erro) => {
            res.status(500).send("Erro ao cadastrar Mensagem: " + erro);
        });

}

export function buscarImagem(req, res) {

    const nomeImagem = req.params.nomeImagem;

    const caminho = path.join(modulePath, '..', '..', 'public', 'uploads', decodeURI(nomeImagem));

    return res.sendFile(caminho, { headers: { 'Content-Type': 'image/jpeg' } });
}

